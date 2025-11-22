import { module_score } from "../types"
import { signature_patterns } from "../data"
import { seg_text, normalize } from "../core/embedding"

type trie_node = { next: Record<string, trie_node>; end?: string[] }

const make_trie = (phrases: string[]): trie_node => {
  const root: trie_node = { next: {} }
  for (const raw of phrases) {
    const w = raw.toLowerCase()
    let cur = root
    for (const ch of w) {
      cur = cur.next[ch] ?? (cur.next[ch] = { next: {} })
    }
    ; (cur.end ??= []).push(w)
  }
  return root
}

const sig_trie = make_trie(signature_patterns)

const scan_trie = (txt: string) => {
  const hits = new Set<string>()
  const lo = txt.toLowerCase()
  for (let i = 0; i < lo.length; i++) {
    let cur = sig_trie
    let j = i
    while (j < lo.length) {
      const ch = lo[j]
      const nxt = cur.next[ch]
      if (!nxt) break
      cur = nxt
      if (cur.end) cur.end.forEach(s => hits.add(s))
      j++
    }
  }
  return [...hits]
}

const levenshtein = (a: string, b: string) => {
  const la = a.length, lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la
  const prev = new Array(lb + 1).fill(0)
  const cur = new Array(lb + 1).fill(0)
  for (let j = 0; j <= lb; j++)prev[j] = j
  for (let i = 1; i <= la; i++) {
    cur[0] = i
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= lb; j++) {
      const cb = b.charCodeAt(j - 1)
      if (ca === cb) cur[j] = prev[j - 1]
      else cur[j] = Math.min(prev[j - 1], prev[j], cur[j - 1]) + 1
    }
    for (let j = 0; j <= lb; j++)prev[j] = cur[j]
  }
  return cur[lb]
}

const fuzzy_hits = (txt: string) => {
  const segs = seg_text(txt)
  const result: { phrase: string; sim: number }[] = []
  for (const phrase of signature_patterns) {
    for (const seg of segs) {
      const lv = levenshtein(seg, phrase)
      const sim = 1 - lv / Math.max(seg.length, phrase.length)
      if (sim > 0.82) result.push({ phrase, sim })
    }
  }
  return result
}

export const score_signatures = (txt: string): module_score => {
  const exact = scan_trie(txt)
  const fuzzy = fuzzy_hits(txt)
  const reasons: string[] = []
  if (exact.length) reasons.push("direct_signature_" + exact[0])
  if (fuzzy.length) reasons.push("fuzzy_signature_" + fuzzy[0].phrase)
  const ex_score = exact.length ? Math.min(1, 0.6 + 0.1 * (exact.length - 1)) : 0
  const f_best = fuzzy.reduce((m, v) => Math.max(m, v.sim), 0)
  const f_score = f_best ? ((f_best - 0.82) / (1 - 0.82)) * 0.6 : 0
  return { score: normalize(ex_score + f_score), detail: reasons }
}
