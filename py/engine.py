from __future__ import annotations

from typing import Dict, List

from .modules.rag import sanitize_rag_chunks, score_rag
from .modules.semantic import score_semantic
from .modules.signature import score_signatures
from .modules.integrity import score_integrity
from .modules.sentence_guard import sanitize_user_input, score_segments
from .modules.unicode_scan import score_unicode

DEFAULT_WEIGHTS = {
    "signature": 0.25,
    "semantic": 0.25,
    "integrity": 0.2,
    "rag": 0.15,
    "unicode": 0.05,
    "segments": 0.1,
}


def _collect(detail: List[str], fallback: str, score: float) -> List[str]:
    return detail if detail else ([fallback] if score > 0 else [])


def run_secuprompt(user: str, system: str = "", rag: List[str] | None = None, weights: Dict[str, float] | None = None) -> Dict[str, object]:
    weights = {**DEFAULT_WEIGHTS, **(weights or {})}
    signature = score_signatures(user)
    semantic = score_semantic(user)
    integrity = score_integrity(system, user)
    rag_score = score_rag(rag)
    unicode_mod = score_unicode(user)
    segments = score_segments(system, user)

    risk = (
        signature["score"] * weights["signature"]
        + semantic["score"] * weights["semantic"]
        + integrity["score"] * weights["integrity"]
        + rag_score["score"] * weights["rag"]
        + unicode_mod["score"] * weights["unicode"]
        + segments["score"] * weights["segments"]
    )

    if risk > 0.65:
        action = "block"
    elif risk > 0.35:
        action = "sanitize"
    else:
        action = "allow"

    reasons = [
        *_collect(signature["detail"], "sig_detect", signature["score"]),
        *_collect(semantic["detail"], "semantic_threat", semantic["score"]),
        *_collect(integrity["detail"], "integrity_risk", integrity["score"]),
        *_collect(rag_score["detail"], "rag_poison", rag_score["score"]),
        *_collect(unicode_mod["detail"], "unicode_anomaly", unicode_mod["score"]),
        *_collect(segments["detail"], "segment_threat", segments["score"]),
    ]
    sanitized_chunks = sanitize_rag_chunks(rag, rag_score["detail"])
    sanitized_user, user_removed, user_changed = sanitize_user_input(system, user)
    removal_note = ""
    if user_removed:
        removal_note = "[secuprompt removed {} segment(s): {}]".format(
            len(user_removed),
            ", ".join(rem["reasons"][0] if rem["reasons"] else "segment_risk" for rem in user_removed),
        )
    user_line = ""
    if user_changed:
        user_line = "[sanitized user] {}".format(
            sanitized_user if sanitized_user else "[secuprompt removed user content]"
        )
    sanitized_parts = [part for part in [user_line, removal_note, "\n".join(sanitized_chunks)] if part]
    sanitized_prompt = "\n".join(sanitized_parts) if sanitized_parts else None
    rag_changed = any(chunk.startswith("[rag chunk") for chunk in sanitized_chunks)
    dangerous = any(
        any(reason in ("hint_dan_role", "hint_hidden_directives", "hint_reveal_system", "hint_override_policy") for reason in rem.get("reasons", []))
        for rem in user_removed
    )
    if dangerous:
        action = "block"
    elif action == "allow" and (user_changed or rag_changed):
        action = "sanitize"

    modules = {
        "signature": signature,
        "semantic": semantic,
        "integrity": integrity,
        "rag": rag_score,
        "unicode": unicode_mod,
        "segments": segments,
    }
    return {
        "allowed": action == "allow",
        "action": action,
        "risk": round(risk, 3),
        "reason": list(dict.fromkeys(reasons)),
        "sanitized_prompt": sanitized_prompt,
        "modules": modules,
    }
