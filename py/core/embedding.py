from __future__ import annotations

import math
import re
from typing import List

VEC_DIM = 64
TOKEN_RE = re.compile(r"[^\w]+", re.UNICODE)


def seg_text(text: str) -> List[str]:
    bits = [s.strip().lower() for s in re.split(r"[.!?\n\r]+", text) if s.strip()]
    return bits or [text.lower()]


def embed(text: str) -> List[float]:
    vec = [0.0] * VEC_DIM
    tokens = [t for t in TOKEN_RE.split(text.lower()) if t]
    if not tokens:
        return vec
    for tok in tokens:
        h = 0
        for ch in tok:
            h = (h * 31 + ord(ch)) & 0xFFFFFFFF
        idx = h % VEC_DIM
        vec[idx] += 1
        idx2 = (h >> 3) % VEC_DIM
        vec[idx2] += 0.5
    mag = math.sqrt(sum(x * x for x in vec))
    if mag:
        vec = [x / mag for x in vec]
    return vec


def cosine(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    ma = math.sqrt(sum(x * x for x in a))
    mb = math.sqrt(sum(y * y for y in b))
    if ma == 0 or mb == 0:
        return 0.0
    return dot / (ma * mb)


def normalize(value: float) -> float:
    if value < 0:
        return 0.0
    if value > 1:
        return 1.0
    return value
