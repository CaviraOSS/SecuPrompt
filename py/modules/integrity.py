from __future__ import annotations

import re
from typing import List

from ..core.embedding import cosine, embed, normalize, seg_text
from ..data import modality_map

POSITIVE = [re.escape(x.strip()) for x in modality_map().get("positive", []) if x.strip()]
NEGATIVE = [re.escape(x.strip()) for x in modality_map().get("negative", []) if x.strip()]
POS_RE = re.compile("|".join(POSITIVE), re.IGNORECASE) if POSITIVE else None
NEG_RE = re.compile("|".join(NEGATIVE), re.IGNORECASE) if NEGATIVE else None


def _extract_directives(text: str, polarity: int) -> List[str]:
    pattern = POS_RE if polarity > 0 else NEG_RE
    if not pattern:
        return []
    directives = []
    for match in pattern.finditer(text):
        start = match.end()
        topic = text[start : start + 60]
        topic = re.split(r"[.!?,]", topic)[0].strip()
        if topic:
            directives.append(topic.lower())
    return directives


def _detect_flip(system: str, user: str) -> int:
    sys_pos = _extract_directives(system, 1)
    sys_neg = _extract_directives(system, -1)
    user_pos = _extract_directives(user, 1)
    user_neg = _extract_directives(user, -1)
    flips = 0
    for topic in sys_pos:
        if any(u.startswith(topic[:10]) for u in user_neg):
            flips += 1
    for topic in sys_neg:
        if any(u.startswith(topic[:10]) for u in user_pos):
            flips += 1
    return flips


def _overlap_score(system: str, user: str) -> float:
    sys_vecs = [embed(seg) for seg in seg_text(system)]
    user_vecs = [embed(seg) for seg in seg_text(user)]
    if not sys_vecs or not user_vecs:
        return 0.0
    scores = []
    for u in user_vecs:
        best = max(cosine(u, s) for s in sys_vecs)
        scores.append(best)
    return sum(scores) / len(scores)


def score_integrity(system: str, user: str) -> dict:
    overlap = _overlap_score(system, user)
    flips = _detect_flip(system, user)
    detail: List[str] = []
    if flips:
        detail.append("modality_override")
    if overlap > 0.65:
        detail.append("high_instruction_overlap")
    if flips:
        score = min(1.0, 0.7 + 0.1 * (flips - 1) + overlap * 0.3)
    else:
        score = max(0.0, overlap - 0.4)
    return {"score": normalize(score), "detail": detail}
