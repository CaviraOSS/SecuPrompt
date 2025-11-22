import { module_score } from "../types"
import { semantic_clusters } from "../data"
import { embed, cosine, normalize, vec_dim } from "../core/embedding"

const cluster_vecs = semantic_clusters.map(({ tag, samples }) => {
  const sum = new Array(vec_dim).fill(0)
  samples.forEach(s => {
    const e = embed(s)
    for (let i = 0; i < vec_dim; i++)sum[i] += e[i]
  })
  const count = samples.length || 1
  for (let i = 0; i < vec_dim; i++)sum[i] /= count
  return { tag, vec: sum }
})

export const score_semantic = (txt: string): module_score => {
  const vec = embed(txt)
  let best = 0
  let tag = "none"
  for (const { tag: c_tag, vec: c_vec } of cluster_vecs) {
    const sim = cosine(vec, c_vec)
    if (sim > best) { best = sim; tag = c_tag }
  }
  const level = best >= 0.78 ? "high" : best >= 0.5 ? "medium" : "low"
  const detail = level === "low" ? [] : [`semantic_${level}_${tag}`]
  const score = best >= 0.5 ? best : best * 0.5
  return { score: normalize(score), detail }
}
