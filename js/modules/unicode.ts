import { module_score } from "../types"
import { unicode_ranges } from "../data"
import { normalize } from "../core/embedding"

const unicode_flags = (txt: string) => {
  let flags = 0
  for (const ch of txt) {
    const code = ch.codePointAt(0)!
    if (unicode_ranges.hidden_ranges.some(([s, e]) => code >= s && code <= e)) flags++
    else if (unicode_ranges.homoglyph_blocks.some(([s, e]) => code >= s && code <= e)) flags++
    if (flags >= 4) break
  }
  return flags
}

export const score_unicode = (txt: string): module_score => {
  const flags = unicode_flags(txt)
  return { score: normalize(flags / 4), detail: flags ? [`unicode_flags_${flags}`] : [] }
}
