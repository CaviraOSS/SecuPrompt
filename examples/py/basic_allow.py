from secuprompt import run_secuprompt

review = run_secuprompt(user="Explain CORS and how browsers enforce it.")

if review["action"] == "allow":
    print("allowed, forward to model")
elif review["action"] == "sanitize":
    print("sanitize first:\n", review["sanitized_prompt"])
else:
    print("blocked:", review["reason"])
