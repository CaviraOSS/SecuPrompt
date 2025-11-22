import { module_score } from "../types"
import { rag_config } from "../data"
import { embed, cosine, normalize } from "../core/embedding"

const esc = (txt: string) => txt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const count_words = (txt: string, list: string[]) => {
  const low = txt.toLowerCase()
  let total = 0
  for (const w of list) {
    const reg = new RegExp(`\\b${esc(w)}\\b`, "g")
    total += low.match(reg)?.length ?? 0
  }
  return total
}

const sentence_split = (txt: string) =>
  txt
    .split(/(?<=[\.!\?])/)
    .map(s => s.trim())
    .filter(Boolean)

const imperative_triggers = [
  /must(?!\s+not)/i,
  /should(?!\s+not)/i,
  /need to/i,
  /you will/i,
  /follow exactly/i,
  /drop all safeties/i,
  /even if it conflicts/i,
  /do not comply/i,
  /assistant must/i
]

const is_imperative_sentence = (sentence: string) => {
  const low = sentence.toLowerCase()
  const first = sentence.split(/\s+/)[0]?.toLowerCase() ?? ""
  if (rag_config.imperative_words.includes(first)) return true
  if (imperative_triggers.some(reg => reg.test(sentence))) return true
  return rag_config.role_words.some(w => low.includes(w) && /must|should|need|follow|obey|ignore/.test(low))
}

const rag_center = embed(rag_config.semantic_probe)

type chunk_analysis = {
  threat: number
  drop: boolean
  sanitize: boolean
  sanitized: string
  sanitizedChanged: boolean
}

const sanitize_chunk = (chunk: string) => {
  const sentences = sentence_split(chunk)
  let changed = false
  const kept = sentences.filter(seg => {
    if (is_imperative_sentence(seg)) {
      changed = true
      return false
    }
    const low = seg.toLowerCase()
    if (rag_config.role_words.some(w => low.includes(w))) {
      changed = true
      return false
    }
    return true
  })
  const sanitized = kept.join(" ").trim()
  return { sanitized: sanitized || "[rag chunk removed]", changed }
}

const analyze_chunk = (chunk: string): chunk_analysis => {
  const sentences = sentence_split(chunk)
  const imp_hits = sentences.filter(is_imperative_sentence).length
  const imp_density = sentences.length ? imp_hits / sentences.length : 0
  const role = count_words(chunk, rag_config.role_words)
  const sim = cosine(embed(chunk), rag_center)
  let threat = 0.35 * imp_density + 0.4 * sim + 0.25 * Math.min(1, role / 2)
  let drop = threat > 0.2
  const rawSanitized = sanitize_chunk(chunk)
  const sanitize =
    drop ||
    threat > 0.1 ||
    rawSanitized.changed ||
    /assistant must|ignore/i.test(chunk)
  if (sanitize) {
    threat = 1
    drop = true
  }
  return {
    threat: normalize(threat),
    drop,
    sanitize,
    sanitized: rawSanitized.sanitized,
    sanitizedChanged: rawSanitized.changed
  }
}

export const score_rag = (chunks?: string[]): module_score => {
  if (!chunks?.length) return { score: 0, detail: [] }
  const issues: string[] = []
  let top = 0
  for (let i = 0; i < chunks.length; i++) {
    const analysis = analyze_chunk(chunks[i])
    if (analysis.threat > top) top = analysis.threat
    if (analysis.drop) issues.push(`rag_chunk_${i}_drop`)
    else if (analysis.sanitize) issues.push(`rag_chunk_${i}_sanitize`)
  }
  return { score: normalize(top), detail: issues }
}

export const drop_rag_chunks = (chunks?: string[], flags?: string[]) => {
  if (!chunks) return []
  const drop = new Set<number>()
  flags?.forEach(f => {
    const match = f.match(/rag_chunk_(\d+)_drop/)
    if (match) drop.add(Number(match[1]))
  })
  return chunks.filter((_, i) => !drop.has(i))
}

export const sanitize_rag_chunks = (chunks?: string[], flags?: string[]) => {
  if (!chunks?.length) return []
  const drop = new Set<number>()
  const cleanse = new Set<number>()
  flags?.forEach(flag => {
    const drop_match = flag.match(/rag_chunk_(\d+)_drop/)
    const sanitize_match = flag.match(/rag_chunk_(\d+)_sanitize/)
    if (drop_match) drop.add(Number(drop_match[1]))
    else if (sanitize_match) cleanse.add(Number(sanitize_match[1]))
  })
  const out: string[] = []
  chunks.forEach((chunk, idx) => {
    if (drop.has(idx)) return
    const analysis = analyze_chunk(chunk)
    const shouldSanitize = cleanse.has(idx) || analysis.sanitize
    if (shouldSanitize) {
      if (analysis.sanitized && analysis.sanitized !== "[rag chunk removed]") {
        out.push(`[rag chunk ${idx} sanitized] ${analysis.sanitized}`)
      } else {
        out.push(`[rag chunk ${idx} removed]`)
      }
      return
    }
    out.push(chunk)
  })
  return out
}
