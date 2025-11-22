export const vec_dim = 64
const token_re = /[^\p{L}\p{N}]+/u

export type vec = number[]

export const seg_text = (txt: string) => {
  const bits = txt
    .split(/[\.\!\?\n\r]+/g)
    .map(v => v.trim().toLowerCase())
    .filter(Boolean)
  if (!bits.length) bits.push(txt.toLowerCase())
  return bits
}

export const embed = (txt: string): vec => {
  const v = new Array(vec_dim).fill(0)
  const toks = txt.toLowerCase().split(token_re).filter(Boolean)
  if (!toks.length) return v
  for (const t of toks) {
    let h = 0
    for (let i = 0; i < t.length; i++) {
      h = (h * 31 + t.charCodeAt(i)) >>> 0
    }
    const idx = h % vec_dim
    v[idx] += 1
    const idx2 = (h >>> 3) % vec_dim
    v[idx2] += 0.5
  }
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  if (mag === 0) return v
  for (let i = 0; i < vec_dim; i++)v[i] /= mag
  return v
}

export const cosine = (a: vec, b: vec) => {
  let dot = 0, ma = 0, mb = 0
  for (let i = 0; i < vec_dim; i++) {
    dot += a[i] * b[i]
    ma += a[i] * a[i]
    mb += b[i] * b[i]
  }
  if (ma === 0 || mb === 0) return 0
  return dot / (Math.sqrt(ma) * Math.sqrt(mb))
}

export const normalize = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v
