import { readFileSync } from "fs"
import { resolve } from "path"

const data_root = resolve(__dirname, "..", "data")

const load_json = <t>(file: string): t => {
  const full = resolve(data_root, file)
  return JSON.parse(readFileSync(full, "utf8")) as t
}

export const signature_patterns = load_json<string[]>("patterns.json")
export const semantic_clusters = load_json<
  { tag: string; samples: string[] }[]
>("threats.json")
export const rag_config = load_json<{
  imperative_words: string[]
  role_words: string[]
  semantic_probe: string
}>("rag.json")
export const unicode_ranges = load_json<{
  hidden_ranges: [number, number][]
  homoglyph_blocks: [number, number][]
}>("unicode.json")
export const modality_map = load_json<{
  positive: string[]
  negative: string[]
}>("modality.json")
