import { module_score } from "../types"
import { normalize } from "../core/embedding"
import { score_signatures } from "./signature"
import { score_semantic } from "./semantic"
import { score_integrity } from "./integrity"

const sentence_split = (txt: string) =>
  txt
    .split(/(?<=[\.!\?])/)
    .map(s => s.trim())
    .filter(Boolean)

const injection_hints: { label: string; reg: RegExp }[] = [
  { label: "hint_ignore_chain", reg: /ignore (all|any|previous).*(instruction|rule)/i },
  { label: "hint_reveal_system", reg: /reveal (the )?(system|developer) (prompt|message)/i },
  { label: "hint_role_swap", reg: /act as|pretend you are|from now on/i },
  { label: "hint_unrestricted", reg: /unfiltered|unrestricted|without limitation|no rules/i },
  { label: "hint_override_policy", reg: /override.*policy|bypass.*policy/i },
  { label: "hint_even_when_forbidden", reg: /even when (?:it\s)?is forbidden|obey me/i },
  { label: "hint_system_terms", reg: /developer|system prompt|policy stack|instruction set/i },
  { label: "hint_hidden", reg: /hidden directive|hidden instruction|unsafe payload/i }
]

const weight_signature = 0.55
const weight_semantic = 0.25
const weight_integrity = 0.2
const removal_threshold = 0.1

const analyze_sentence = (system: string, sentence: string) => {
  const sig = score_signatures(sentence)
  const sem = score_semantic(sentence)
  const integ = score_integrity(system, sentence)
  const hints = injection_hints.filter(({ reg }) => reg.test(sentence))
  const hint_bonus = Math.min(0.4, hints.length * 0.15)
  let score = normalize(sig.score * weight_signature + sem.score * weight_semantic + integ.score * weight_integrity + hint_bonus)
  if (hints.length) score = 1
  const reasons = [
    ...sig.detail,
    ...sem.detail,
    ...integ.detail,
    ...hints.map(h => h.label)
  ]
  return { text: sentence, score, reasons }
}

export const analyze_user_sentences = (system: string, user: string) => {
  const sentences = sentence_split(user)
  return sentences.map(s => analyze_sentence(system, s))
}

export const score_segments = (system: string, user: string): module_score => {
  const sentences = analyze_user_sentences(system, user)
  if (!sentences.length) return { score: 0, detail: [] }
  const maxScore = Math.max(...sentences.map(s => s.score))
  const risky = sentences
    .map((seg, idx) => ({ seg, idx }))
    .filter(item => item.seg.score >= removal_threshold)
    .map(({ seg, idx }) => `segment_${idx}_risk_${seg.score.toFixed(2)}`)
  return { score: normalize(maxScore), detail: risky }
}

export const sanitize_user_input = (system: string, user: string) => {
  const sentences = analyze_user_sentences(system, user)
  if (!sentences.length) return { sanitized: user.trim(), removed: [] as { text: string; reasons: string[] }[], changed: false }
  const safe: string[] = []
  const removed: { text: string; reasons: string[] }[] = []
  sentences.forEach(seg => {
    if (seg.score >= removal_threshold) removed.push({ text: seg.text, reasons: seg.reasons })
    else safe.push(seg.text)
  })
  return {
    sanitized: safe.join(" ").replace(/\s+/g, " ").trim(),
    removed,
    changed: removed.length > 0
  }
}
