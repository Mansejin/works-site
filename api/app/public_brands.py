"""Brand slugs intentionally shared without team token (read + limited write)."""

from __future__ import annotations

PUBLIC_BRANDS = frozenset({"xenics", "vendict", "inic", "galaxy"})


def is_public_brand(project: str) -> bool:
    return str(project or "").strip().lower() in PUBLIC_BRANDS
