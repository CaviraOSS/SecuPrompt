from __future__ import annotations

from typing import List

from ..core.embedding import cosine, embed, normalize
from ..data import semantic_clusters

_CLUSTERS: List[dict] = []
for entry in semantic_clusters():
    tag = entry["tag"]
    centroid = [0.0] * 64
    samples: List[str] = entry.get("samples", [])
    if not samples:
        continue
    for sample in samples:
        vec = embed(sample)
        centroid = [c + v for c, v in zip(centroid, vec)]
    centroid = [c / len(samples) for c in centroid]
    _CLUSTERS.append({"tag": tag, "vec": centroid})


def score_semantic(text: str) -> dict:
    vec = embed(text)
    best = 0.0
    best_tag = "unknown"
    for cluster in _CLUSTERS:
        sim = cosine(vec, cluster["vec"])
        if sim > best:
            best = sim
            best_tag = cluster["tag"]
    level = "high" if best >= 0.78 else "medium" if best >= 0.5 else "low"
    detail = [] if level == "low" else [f"semantic_{level}_{best_tag}"]
    score = best if best >= 0.5 else best * 0.5
    return {"score": normalize(score), "detail": detail}
