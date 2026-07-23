"""Simple in-process rate limiter for login / public writes."""

from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_sec: float) -> None:
        self.limit = limit
        self.window_sec = window_sec
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window_sec
        with self._lock:
            alive = [t for t in self._hits[key] if t >= cutoff]
            if len(alive) >= self.limit:
                self._hits[key] = alive
                return False
            alive.append(now)
            self._hits[key] = alive
            return True


# 20 login attempts per IP per 10 minutes
LOGIN_LIMITER = SlidingWindowLimiter(limit=20, window_sec=600.0)
# 30 public productlist PUTs per IP per 10 minutes
PRODUCTLIST_WRITE_LIMITER = SlidingWindowLimiter(limit=30, window_sec=600.0)
