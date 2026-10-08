"""Legacy migration entry point, now a thin wrapper around the shared
database initialiser.

``python db_migrate.py`` used to create the ``applications`` table plus a couple
of later columns. All of that is part of ``database/init_db.py`` now (which also
creates every other table the API needs), so this script simply calls it. It is
kept because deployment docs and local workflows reference it.

Safe to run repeatedly: it only creates what is missing and never deletes data.
"""

import os
import sys

# Make the script location importable so the database package resolves the same
# way regardless of the current working directory (e.g. project root).
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)


def main() -> None:
    from database.init_db import init_database

    print("Running database migrations...\n")
    init_database(verbose=True)
    print("\nDatabase migration complete")


if __name__ == "__main__":
    main()
