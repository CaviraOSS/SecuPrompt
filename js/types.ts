export type shield_input = {
  user: string
  system?: string
  rag?: string[]
}

export type module_score = { score: number; detail: string[] }

export type shield_result = {
  allowed: boolean
  action: "allow" | "sanitize" | "block"
  risk: number
  reason: string[]
  sanitized_prompt?: string
  modules: {
    signature: module_score
    semantic: module_score
    integrity: module_score
    rag: module_score
    unicode: module_score
    segments: module_score
  }
}
