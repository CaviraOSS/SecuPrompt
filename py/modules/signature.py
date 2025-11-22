from __future__ import annotations

import re
from typing import Dict, List

from ..core.embedding import normalize, seg_text
from ..data import signature_patterns


class TrieNode:
    __slots__ = ("next", "end")

    def __init__(self) -> None:
        self.next: Dict[str, "TrieNode"] = {}
        self.end: List[str] = []


def _build_trie(patterns: List[str]) -> TrieNode:
    root = TrieNode()
    for phrase in patterns:
        node = root
        for ch in phrase.lower():
            node = node.next.setdefault(ch, TrieNode())
        node.end.append(phrase.lower())
    return root


SIG_TRIE = _build_trie(signature_patterns())


def _scan(txt: str) -> List[str]:
    hits: List[str] = []
    lo = txt.lower()
    for i in range(len(lo)):
        node = SIG_TRIE
        j = i
        while j < len(lo):
            ch = lo[j]
            if ch not in node.next:
                break
            node = node.next[ch]
            if node.end:
                hits.extend(node.end)
            j += 1
    return list(dict.fromkeys(hits))


def _levenshtein(a: str, b: str) -> int:
    la, lb = len(a), len(b)
    if la == 0:
        return lb
    if lb == 0:
        return la
    prev = list(range(lb + 1))
    cur = [0] * (lb + 1)
    for i in range(1, la + 1):
        cur[0] = i
        ca = a[i - 1]
        for j in range(1, lb + 1):
            cb = b[j - 1]
            if ca == cb:
                cur[j] = prev[j - 1]
            else:
                cur[j] = min(prev[j - 1], prev[j], cur[j - 1]) + 1
        prev, cur = cur, prev
    return prev[lb]


def _fuzzy_hits(txt: str) -> List[Dict[str, float]]:
    segs = seg_text(txt)
    out: List[Dict[str, float]] = []
    for phrase in signature_patterns():
        for seg in segs:
            dist = _levenshtein(seg, phrase)
            sim = 1 - dist / max(len(seg), len(phrase))
            if sim > 0.82:
                out.append({"phrase": phrase, "sim": sim})
                break
    return out


def score_signatures(text: str) -> Dict[str, object]:
    exact = _scan(text)
    fuzzy = _fuzzy_hits(text)
    detail: List[str] = []
    if exact:
        detail.append(f"direct_signature_{exact[0]}")
    if fuzzy:
        detail.append(f"fuzzy_signature_{fuzzy[0]['phrase']}")
    ex_score = min(1.0, 0.6 + 0.1 * (len(exact) - 1)) if exact else 0.0
    f_best = max((hit["sim"] for hit in fuzzy), default=0.0)
    f_score = ((f_best - 0.82) / (1 - 0.82)) * 0.6 if f_best else 0.0
    return {"score": normalize(ex_score + f_score), "detail": detail}


def sanitize_text(text: str) -> str:
    hits = _scan(text)
    if not hits:
        return text.strip()
    sentences = [seg.strip() for seg in re.split(r"(?<=[.!?])", text) if seg.strip()]
    sanitized_parts: List[str] = []
    for seg in sentences:
        low = seg.lower()
        if any(hit in low for hit in hits):
            continue
        sanitized_parts.append(seg)
    sanitized = " ".join(sanitized_parts).strip()
    return sanitized or "[sanitized user prompt removed]"
