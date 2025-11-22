import { module_score } from "../types"
import { modality_map } from "../data"
import { embed, cosine, normalize, seg_text } from "../core/embedding"

type directive = { topic: string; pol: number }

const esc = (txt: string) => txt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const make_reg = (list: string[]) => new RegExp(list.map(esc).join("|"), "gi")

const modal_rules: [RegExp, number][] = [
  [make_reg(modality_map.negative), -1],
  [make_reg(modality_map.positive), 1]
]

const extract_directives = (txt: string): directive[] => {
  const res: directive[] = []
  const low = txt.toLowerCase()
  for (const [reg, pol] of modal_rules) {
    reg.lastIndex = 0
    let m = null as RegExpExecArray | null
    while ((m = reg.exec(low))) {
      const start = m.index + m[0].length
      const topic = low
        .slice(start, start + 60)
        .split(/[\.\!\?\,]/)[0]
        .trim()
      if (topic) res.push({ topic, pol })
    }
  }
  return res
}

const detect_flip = (sys: string, user: string) => {
  const sysd = extract_directives(sys)
  const userd = extract_directives(user)
  let flips = 0
  for (const s of sysd) {
    for (const u of userd) {
      if (u.topic && s.topic && u.topic.startsWith(s.topic.slice(0, 10))) {
        if (Math.sign(s.pol) !== Math.sign(u.pol)) flips++
      }
    }
  }
  return flips
}

const clause_vecs = (txt: string) => seg_text(txt).map(embed)

const overlap_score = (sys: string, user: string) => {
  const s = clause_vecs(sys)
  const u = clause_vecs(user)
  if (!s.length || !u.length) return 0
  let sum = 0
  for (const uv of u) {
    let best = 0
    for (const sv of s) {
      best = Math.max(best, cosine(uv, sv))
    }
    sum += best
  }
  return sum / u.length
}

export const score_integrity = (sys: string, user: string): module_score => {
  const overlap = overlap_score(sys, user)
  const flips = detect_flip(sys, user)
  const reasons: string[] = []
  if (flips) reasons.push("modality_override")
  if (overlap > 0.65) reasons.push("high_instruction_overlap")
  let score = 0
  if (flips) score = Math.min(1, 0.7 + 0.1 * (flips - 1) + overlap * 0.3)
  else score = Math.max(0, overlap - 0.4)
  return { score: normalize(score), detail: reasons }
}
