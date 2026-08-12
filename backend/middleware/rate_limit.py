"""Simple in-memory rate limiting per authenticated user."""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "30"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "3600"))

_buckets: dict[str, deque[float]] = defaultdict(deque)


def enforce_rate_limit(request: Request, user_id: str) -> None:
    if os.getenv("ALLOW_UNAUTHENTICATED", "false").lower() == "true" and user_id == "dev-user":
        return

    now = time.monotonic()
    bucket = _buckets[user_id]

    while bucket and now - bucket[0] > RATE_LIMIT_WINDOW_SECONDS:
        bucket.popleft()

    if len(bucket) >= RATE_LIMIT_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please wait before trying again.",
        )

    bucket.append(now)
