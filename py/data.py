from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

DATA_DIR = Path(__file__).resolve().parent / "data_files"


def _read_json(name: str) -> Any:
    path = DATA_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"required data file missing: {path}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache()
def signature_patterns() -> List[str]:
    return _read_json("patterns.json")


@lru_cache()
def semantic_clusters() -> List[Dict[str, Any]]:
    return _read_json("threats.json")


@lru_cache()
def rag_config() -> Dict[str, Any]:
    return _read_json("rag.json")


@lru_cache()
def unicode_ranges() -> Dict[str, List[List[int]]]:
    return _read_json("unicode.json")


@lru_cache()
def modality_map() -> Dict[str, List[str]]:
    return _read_json("modality.json")
