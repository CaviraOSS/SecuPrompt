from __future__ import annotations

from ..core.embedding import normalize
from ..data import unicode_ranges

_RANGES = unicode_ranges()
_HIDDEN = _RANGES.get("hidden_ranges", [])
_HOMO = _RANGES.get("homoglyph_blocks", [])


def _count_flags(text: str) -> int:
    flags = 0
    for ch in text:
        code = ord(ch)
        if any(start <= code <= end for start, end in _HIDDEN):
            flags += 1
        elif any(start <= code <= end for start, end in _HOMO):
            flags += 1
        if flags >= 4:
            break
    return flags


def score_unicode(text: str) -> dict:
    flags = _count_flags(text)
    detail = [f"unicode_flags_{flags}"] if flags else []
    return {"score": normalize(flags / 4), "detail": detail}
