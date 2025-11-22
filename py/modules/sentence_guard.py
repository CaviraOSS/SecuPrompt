from __future__ import annotations

import re
from typing import Dict, List, Tuple

from .integrity import score_integrity
from .semantic import score_semantic
from .signature import score_signatures
from ..core.embedding import normalize

INJECTION_HINTS = [
    ("hint_ignore_chain", re.compile(r"ignore (all|any|previous).*(instruction|rule)", re.IGNORECASE)),
    ("hint_reveal_system", re.compile(r"reveal (the )?(system|developer) (prompt|message)", re.IGNORECASE)),
    ("hint_role_swap", re.compile(r"act as|pretend you are|from now on", re.IGNORECASE)),
    ("hint_unrestricted", re.compile(r"unfiltered|unrestricted|without limitation|no rules", re.IGNORECASE)),
    ("hint_override_policy", re.compile(r"override.*policy|bypass.*policy", re.IGNORECASE)),
    ("hint_even_when_forbidden", re.compile(r"even when .*forbidden|obey me", re.IGNORECASE)),
    ("hint_system_terms", re.compile(r"developer|system prompt|policy stack|instruction set", re.IGNORECASE)),
    ("hint_dan_role", re.compile(r"you are (?:now\s+)?dan|dan stands for", re.IGNORECASE)),
    ("hint_hidden_directives", re.compile(r"hidden directive|hidden instruction|unsafe payload", re.IGNORECASE)),
]

REMOVAL_THRESHOLD = 0.2


def _split_sentences(text: str) -> List[str]:
    return [seg.strip() for seg in re.split(r"(?<=[.!?])", text) if seg.strip()]


def _analyze_sentence(system: str, sentence: str) -> Dict:
    sig = score_signatures(sentence)
    sem = score_semantic(sentence)
    integ = score_integrity(system, sentence)
    hints = [label for label, pattern in INJECTION_HINTS if pattern.search(sentence)]
    hint_bonus = min(0.4, len(hints) * 0.15)
    score = normalize(sig["score"] * 0.55 + sem["score"] * 0.25 + integ["score"] * 0.2 + hint_bonus)
    detail = sig["detail"] + sem["detail"] + integ["detail"] + hints
    return {"text": sentence, "score": score, "detail": detail}


def analyze_user_sentences(system: str, user: str) -> List[Dict]:
    sentences = _split_sentences(user)
    return [_analyze_sentence(system, sentence) for sentence in sentences]


def score_segments(system: str, user: str) -> dict:
    sentences = analyze_user_sentences(system, user)
    if not sentences:
        return {"score": 0.0, "detail": []}
    risky = [
        f"segment_{idx}_risk_{seg['score']:.2f}"
        for idx, seg in enumerate(sentences)
        if seg["score"] >= REMOVAL_THRESHOLD
    ]
    max_score = max(seg["score"] for seg in sentences)
    return {"score": normalize(max_score), "detail": risky}


def sanitize_user_input(system: str, user: str) -> Tuple[str, List[Dict], bool]:
    sentences = analyze_user_sentences(system, user)
    if not sentences:
        return user.strip(), [], False
    kept: List[str] = []
    removed: List[Dict] = []
    for seg in sentences:
        if seg["score"] >= REMOVAL_THRESHOLD:
            removed.append({"text": seg["text"], "reasons": seg["detail"]})
        else:
            kept.append(seg["text"])
    sanitized = " ".join(kept).strip()
    return sanitized, removed, bool(removed)
