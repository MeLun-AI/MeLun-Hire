"""One-time bootstrap migration onto the Railway persistent volume (``/data``).

Background
----------
The previous deployment kept the SQLite database and uploaded files on the
container's ephemeral filesystem (``/app/database/database.db`` and
``/app/data``). Those locations are wiped on every redeploy, so production data
now lives on a Railway Persistent Volume mounted at ``/data``
(``DATABASE_URL=sqlite:////data/database.db``, ``STORAGE_DIR=/data``).

This script is executed by the service start command *before* uvicorn imports
``main.py`` (and therefore before ``database/init_db.py`` creates the schema):

    python database/migrate_to_volume.py && python -m uvicorn main:app ...

Safety guarantees
-----------------
* **One-time**: if the target database already exists on the volume, the script
  exits immediately without touching anything. Existing volume data is never
  overwritten on any subsequent deployment.
* **Non-destructive to the source**: the database is read through a private
  temp copy, so the original database file, its ``-wal``/``-shm`` sidecars and
  every uploaded file are left byte-for-byte unchanged.
* **WAL-consistent**: the copy uses SQLite's backup API from a temp copy that
  includes the ``-wal``/``-shm`` sidecars, so committed transactions still
  sitting in the write-ahead log are preserved alongside the main file.
* **Uploads**: mirrored file-by-file with skip-if-destination-exists
  semantics; directory structure and file names are preserved so the relative
  references stored in the database (``data/...`` resolved through
  ``config.paths.resolve_stored_path``) keep pointing at the right files.
* **Fail-fast with clean retry**: if the database copy cannot be verified
  (``PRAGMA quick_check``), the incomplete target created by this run is
  removed and the script exits non-zero so the deployment stops instead of
  serving from a broken volume; the next deploy retries from a clean slate.
* **Missing sources are safe**: when ``/app/...`` does not exist (nothing to
  migrate) the script logs and exits 0; application startup then creates an
  empty schema as usual.
* **No sensitive logging**: only paths, file counts, table counts and
  verification results are logged — never upload file names, applicant
  identifiers, database contents or credentials.

Source locations may be overridden for testing with ``MIGRATION_SOURCE_DB``
and ``MIGRATION_SOURCE_DATA_DIR``. The target is always resolved by
``config.paths`` from ``DATABASE_URL`` / ``DB_PATH`` / ``STORAGE_DIR``.
"""
from __future__ import annotations

import logging
import os
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

# Make "python database/migrate_to_volume.py" work from any cwd
# (same pattern as database/init_db.py).
APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if APP_ROOT not in sys.path:
    sys.path.insert(0, APP_ROOT)

# Import the single source of truth for persistent locations. This module only
# reads environment variables — it does not import the application, open the
# database or create any directories.
from config.paths import DATA_DIR, DB_PATH  # noqa: E402

logger = logging.getLogger("migrate_to_volume")

# Leftovers of the previous (ephemeral) deployment.
SOURCE_DB = Path(os.environ.get("MIGRATION_SOURCE_DB", "/app/database/database.db"))
SOURCE_DATA_DIR = Path(os.environ.get("MIGRATION_SOURCE_DATA_DIR", "/app/data"))

_SIDECAR_SUFFIXES = ("-wal", "-shm")

def _remove_failed_target(target: Path) -> None:
    """Remove only artifacts created by this run so the next deploy can retry.

    Called exclusively on the failure path, and only after this run verified
    that the target database did not exist beforehand — nothing pre-existing
    on the volume is ever deleted.
    """
    for path in (target, *(Path(str(target) + s) for s in _SIDECAR_SUFFIXES)):
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not remove incomplete artifact %s", path.name)


def _copy_database(source: Path, target: Path) -> tuple:
    """Copy ``source`` onto ``target`` with SQLite's backup API.

    The source is never opened directly: its files (main database plus any
    ``-wal``/``-shm`` sidecars) are duplicated into a private temp directory
    first, so the original can not be checkpointed, locked or modified in any
    way. Opening the temp copy replays the WAL, and ``Connection.backup``
    then transfers the full, consistent logical database — including
    transactions that only existed in the write-ahead log.

    Returns ``(table_count, quick_check_result)``; raises on any failure.
    """
    tmp_dir = Path(tempfile.mkdtemp(prefix="melun_volume_migration_"))
    try:
        tmp_db = tmp_dir / source.name
        shutil.copy2(source, tmp_db)
        for suffix in _SIDECAR_SUFFIXES:
            sidecar = Path(str(source) + suffix)
            if sidecar.is_file():
                shutil.copy2(sidecar, Path(str(tmp_db) + suffix))

        src_conn = sqlite3.connect(str(tmp_db), timeout=30)
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            dst_conn = sqlite3.connect(str(target), timeout=30)
            try:
                src_conn.backup(dst_conn)
                # The app opens every connection in WAL mode; make sure the
                # copied file matches regardless of the source's journal mode.
                dst_conn.execute("PRAGMA journal_mode=WAL;")
                dst_conn.commit()
                quick_check = str(
                    dst_conn.execute("PRAGMA quick_check;").fetchone()[0]
                ).strip()
                if quick_check.lower() != "ok":
                    raise RuntimeError(
                        f"target database failed quick_check: {quick_check!r}"
                    )
                tables = int(
                    dst_conn.execute(
                        "SELECT count(*) FROM sqlite_master WHERE type = 'table'"
                    ).fetchone()[0]
                )
            finally:
                dst_conn.close()
        finally:
            src_conn.close()
        return tables, quick_check
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _copy_uploads(source_dir: Path, target_dir: Path) -> tuple:
    """Mirror ``source_dir`` into ``target_dir`` without overwriting anything.

    Existing files at the destination are skipped, never replaced, so a
    partially or fully migrated volume can not lose data. Individual file
    failures are counted and skipped so one bad file cannot abort the deploy.

    Returns ``(per_category_counts, failed_count)`` where the counts are
    ``{category: [copied, skipped]}`` and the category is the top-level folder
    name (e.g. ``resumes``) — raw file names are deliberately not tracked.
    """
    counts: dict = {}
    failed = 0
    for root, _dirs, files in os.walk(source_dir):
        rel_root = Path(root).relative_to(source_dir)
        dest_root = target_dir / rel_root
        dest_root.mkdir(parents=True, exist_ok=True)
        # Only top-level folder names are reported (resumes / profile_images /
        # ...); applicant-scoped sub-paths stay unlogged.
        category = rel_root.parts[0] if rel_root.parts else "(root)"
        bucket = counts.setdefault(category, [0, 0])
        for name in files:
            dst_file = dest_root / name
            if dst_file.exists():
                bucket[1] += 1
                continue
            try:
                shutil.copy2(Path(root) / name, dst_file)
                bucket[0] += 1
            except OSError:
                failed += 1
                logger.warning(
                    "One upload could not be copied (file name withheld); continuing"
                )
    return counts, failed


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="[migrate-to-volume] %(message)s")

    if DB_PATH == ":memory:" or str(DB_PATH).startswith("file:"):
        logger.info("Non-file database target — nothing to migrate.")
        return 0

    target_db = Path(DB_PATH)
    logger.info("Target database: %s", target_db)
    logger.info("Target upload root: %s", DATA_DIR)

    # Requirement: never repeat or overwrite the migration. An existing
    # database on the volume means a previous deployment already migrated (or
    # initialised) it — leave it untouched.
    if target_db.exists():
        logger.info(
            "Target database already exists — migration skipped "
            "(one-time bootstrap; existing data is never overwritten)."
        )
        return 0

    if not SOURCE_DB.is_file():
        logger.info(
            "No source database found at %s — nothing to migrate. "
            "Application startup will create a fresh schema.",
            SOURCE_DB,
        )
        return 0

    if SOURCE_DB.resolve() == target_db.resolve():
        logger.info("Source and target database are the same file — nothing to do.")
        return 0

    logger.info("One-time migration: %s -> %s", SOURCE_DB, target_db)
    try:
        tables, quick_check = _copy_database(SOURCE_DB, target_db)
    except Exception:
        logger.exception(
            "Database migration FAILED. The incomplete target of this run was "
            "removed so the next deployment can retry cleanly."
        )
        _remove_failed_target(target_db)
        return 1
    logger.info(
        "Database copied via SQLite backup API: %d tables, quick_check=%s",
        tables,
        quick_check,
    )

    if not SOURCE_DATA_DIR.is_dir():
        logger.info(
            "No source upload directory found at %s — skipping upload copy.",
            SOURCE_DATA_DIR,
        )
    elif SOURCE_DATA_DIR.resolve() == DATA_DIR.resolve():
        logger.info("Source and target upload roots are the same — nothing to do.")
    else:
        counts, failed = _copy_uploads(SOURCE_DATA_DIR, DATA_DIR)
        summary = ", ".join(
            f"{cat}: {copied} copied / {skipped} skipped"
            for cat, (copied, skipped) in sorted(counts.items())
        )
        logger.info(
            "Uploads mirrored without overwriting existing files: %s; failed=%d",
            summary or "no files found",
            failed,
        )

    logger.info(
        "Source files left untouched. Subsequent deployments will skip this "
        "migration because the database now exists on the volume."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())


