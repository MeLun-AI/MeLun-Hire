"""Small in-process rate limiter shared by the login / interview-code / reset flows.

This is intentionally dependency-free (no Redis) because the project runs a
single FastAPI process against SQLite. The buckets are keyed per account
identifier (and per client host where useful) so an attacker cannot brute-force
credentials or interview codes.

Note: with multiple worker processes each worker keeps its own counters. The
limits still apply per worker, which is the practical option for this
deployment model.
"""
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import HTTPException, Request

_RATE_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)

# Attempt limits: (max_attempts, window_seconds)
LOGIN_LIMIT = (10, 300)
VERIFY_CODE_LIMIT = (20, 300)
PASSWORD_RESET_LIMIT = (5, 3600)
INTERVIEW_SUBMIT_LIMIT = (10, 600)


def _normalize(identifier: Optional[str]) -> str:
    return (identifier or "").strip().lower()


def check_rate_limit(key: str, max_attempts: int, window_seconds: int) -> None:
    """Raise 429 when `key` exceeded `max_attempts` inside the window."""
    now = time.monotonic()
    bucket = _RATE_BUCKETS[key]
    while bucket and now - bucket[0] > window_seconds:
        bucket.popleft()
    if len(bucket) >= max_attempts:
        raise HTTPException(
            status_code=429, detail="Too many attempts. Please try again later."
        )
    bucket.append(now)


def client_host(request: Optional[Request]) -> str:
    if request is None:
        return "unknown"
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def limit_login(identifier: str, request: Optional[Request] = None) -> None:
    check_rate_limit(f"login:{_normalize(identifier)}", *LOGIN_LIMIT)
    check_rate_limit(f"login-ip:{client_host(request)}", 30, 300)


def limit_verify_code(identifier: str, request: Optional[Request] = None) -> None:
    check_rate_limit(f"verify:{_normalize(identifier)}", *VERIFY_CODE_LIMIT)
    check_rate_limit(f"verify-ip:{client_host(request)}", 40, 300)


def limit_password_reset(identifier: str, request: Optional[Request] = None) -> None:
    check_rate_limit(f"forgot:{_normalize(identifier)}", *PASSWORD_RESET_LIMIT)
    check_rate_limit(f"forgot-ip:{client_host(request)}", 10, 3600)


def limit_interview_submit(identifier: str) -> None:
    check_rate_limit(f"submit:{_normalize(identifier)}", *INTERVIEW_SUBMIT_LIMIT)


def reset_rate_limits() -> None:
    """Testing helper: clear all buckets."""
    _RATE_BUCKETS.clear()
