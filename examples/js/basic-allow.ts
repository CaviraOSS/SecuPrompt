import secuprompt from "secuprompt"

const review = secuprompt.scan({
  user: "Summarize how HTTPS handshakes work for a beginner.",
})

if (review.action === "allow") {
  console.log("allowed, forward to LLM")
} else if (review.action === "sanitize") {
  console.log("sanitize first:", review.sanitized_prompt)
} else {
  console.error("blocked:", review.reason)
}
