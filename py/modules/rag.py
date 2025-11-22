from __future__ import annotations

import re
from typing import List, Set

from ..core.embedding import cosine, embed, normalize
from ..data import rag_config

_CFG = rag_config()
_imperatives: List[str] = _CFG.get("imperative_words", [])
_role_words: List[str] = _CFG.get("role_words", [])
_probe_vec = embed(_CFG.get("semantic_probe", ""))


def _sentence_split(text: str) -> List[str]:
    return [seg.strip() for seg in re.split(r"(?<=[.!?])", text) if seg.strip()]


def _is_imperative(sentence: str) -> bool:
    low = sentence.lower()
    first = (sentence.split() or [""])[0].lower()
    if first in _imperatives:
        return True
    triggers = [
        "must ",
        "should ",
        "need to",
        "you will",
        "follow exactly",
        "drop all safeties",
        "even if it conflicts",
        "assistant must",
        "obey",
        "ignore policy",
    ]
    if any(term in low for term in triggers):
        return True
    if any(word in low for word in _role_words):
        return True
    return False


def _count_role_words(text: str) -> int:
    low = text.lower()
    return sum(low.count(word.lower()) for word in _role_words)


def _sanitize_chunk(chunk: str) -> (str, bool):
    sentences = _sentence_split(chunk)
    kept: List[str] = []
    changed = False
    for sentence in sentences:
        if _is_imperative(sentence):
            changed = True
            continue
        kept.append(sentence)
    cleaned = " ".join(kept).strip()
    return (cleaned or "[rag chunk removed]", changed)


def _analyze_chunk(chunk: str):
    sentences = _sentence_split(chunk)
    if not sentences:
        return {"threat": 0.0, "drop": False, "sanitize": False, "sanitized": chunk, "changed": False}
    imp_hits = sum(1 for sentence in sentences if _is_imperative(sentence))
    imp_density = imp_hits / len(sentences)
    role = _count_role_words(chunk)
    sim = cosine(embed(chunk), _probe_vec)
    threat = normalize(0.35 * imp_density + 0.4 * sim + 0.25 * min(1.0, role / 2))
    drop = threat > 0.65
    sanitized, changed = _sanitize_chunk(chunk)
    sanitize = drop or threat > 0.35 or changed
    return {"threat": threat, "drop": drop, "sanitize": sanitize, "sanitized": sanitized, "changed": changed}


def score_rag(chunks: List[str] | None) -> dict:
    if not chunks:
        return {"score": 0.0, "detail": []}
    details: List[str] = []
    top = 0.0
    for idx, chunk in enumerate(chunks):
        info = _analyze_chunk(chunk)
        top = max(top, info["threat"])
        if info["drop"]:
            details.append(f"rag_chunk_{idx}_drop")
        elif info["sanitize"]:
            details.append(f"rag_chunk_{idx}_sanitize")
    return {"score": normalize(top), "detail": details}


def sanitize_rag_chunks(chunks: List[str] | None, flags: List[str] | None) -> List[str]:
    if not chunks:
        return []
    drop: Set[int] = set()
    sanitize: Set[int] = set()
    for flag in flags or []:
        match = re.search(r"rag_chunk_(\d+)_drop", flag)
        if match:
            drop.add(int(match.group(1)))
            continue
        match = re.search(r"rag_chunk_(\d+)_sanitize", flag)
        if match:
            sanitize.add(int(match.group(1)))
    out: List[str] = []
    for idx, chunk in enumerate(chunks):
        if idx in drop:
            continue
        analysis = _analyze_chunk(chunk)
        if idx in sanitize or analysis["sanitize"]:
            sanitized = analysis["sanitized"]
            if sanitized and sanitized != "[rag chunk removed]":
                out.append(f"[rag chunk {idx} sanitized] {sanitized}")
            else:
                out.append(f"[rag chunk {idx} removed]")
            continue
        out.append(chunk)
    return out
