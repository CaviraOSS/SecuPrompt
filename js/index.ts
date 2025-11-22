import { shield_input, shield_result } from "./types"
import { score_signatures } from "./modules/signature"
import { score_semantic } from "./modules/semantic"
import { score_integrity } from "./modules/integrity"
import { score_rag, sanitize_rag_chunks } from "./modules/rag"
import { score_unicode } from "./modules/unicode"
import { score_segments, sanitize_user_input } from "./modules/sentence_guard"

const default_weights = {
  signature: 0.35,
  semantic: 0.25,
  integrity: 0.2,
  rag: 0.3,
  unicode: 0.05,
  segments: 0.2
}

const collect = (detail: string[], tag: string, score: number) => detail.length ? detail : score > 0 ? [tag] : []

export const run_secuprompt = (input: shield_input, weights = default_weights): shield_result => {
  const system = input.system ?? ""

  const signature = score_signatures(input.user)
  const semantic = score_semantic(input.user)
  const integrity = score_integrity(system, input.user)
  const rag = score_rag(input.rag)
  const unicode = score_unicode(input.user)
  const segments = score_segments(system, input.user)

  let risk =
    signature.score * (weights.signature ?? default_weights.signature) +
    semantic.score * (weights.semantic ?? default_weights.semantic) +
    integrity.score * (weights.integrity ?? default_weights.integrity) +
    rag.score * (weights.rag ?? default_weights.rag) +
    unicode.score * (weights.unicode ?? default_weights.unicode) +
    segments.score * (weights.segments ?? default_weights.segments)

  // base action from numeric risk
  let action: "allow" | "sanitize" | "block" = "allow"
  if (risk > 0.65) action = "block"
  else if (risk > 0.35) action = "sanitize"

  const reasons = [
    ...collect(signature.detail, "sig_detect", signature.score),
    ...collect(semantic.detail, "semantic_threat", semantic.score),
    ...collect(integrity.detail, "integrity_risk", integrity.score),
    ...collect(rag.detail, "rag_poison", rag.score),
    ...collect(unicode.detail, "unicode_anomaly", unicode.score),
    ...collect(segments.detail, "segment_threat", segments.score)
  ]

  const sanitized_chunks = sanitize_rag_chunks(input.rag, rag.detail)
  const { sanitized: sanitized_user, removed: user_removed, changed: user_changed } = sanitize_user_input(system, input.user)

  // hard rules: any removal/sanitize forces sanitize or block regardless of numeric risk
  const ragChanged = sanitized_chunks.some(chunk => chunk.startsWith("[rag chunk"))
  const ragDrops = rag.detail.some(reason => reason.includes("_drop"))
  const hasThreat =
    ragDrops ||
    rag.detail.length > 0 ||
    sanitized_chunks.length > 0 ||
    user_removed.length > 0 ||
    ragChanged ||
    semantic.score >= 0.5 ||
    signature.score > 0 ||
    segments.score >= 0.1

  if (hasThreat) {
    action = "block"
    risk = Math.max(risk, 0.99)
  }

  const removal_note =
    user_removed.length > 0
      ? `[secuprompt removed ${user_removed.length} segment(s): ${user_removed
        .map(seg => seg.reasons[0] ?? "segment_risk")
        .join(", ")}]`
      : ""
  const user_line =
    user_changed
      ? sanitized_user.length > 0
        ? `[sanitized user] ${sanitized_user}`
        : "[secuprompt removed user content]"
      : ""
  const sanitized_parts = [
    user_line,
    removal_note,
    sanitized_chunks.length ? sanitized_chunks.join("\n") : ""
  ].filter(Boolean)
  const sanitized_prompt = sanitized_parts.length ? sanitized_parts.join("\n") : undefined

  return {
    allowed: action === "allow",
    action,
    risk: Number(risk.toFixed(3)),
    reason: Array.from(new Set(reasons)),
    sanitized_prompt,
    modules: { signature, semantic, integrity, rag, unicode, segments }
  }
}

export const secuprompt = {
  scan: run_secuprompt
}

export default secuprompt

// complexity: overall runtime goes linear with prompt length plus signature count
