# Approach

Any voice list can add an item; I spent the time underneath that.

**Understanding speech without paying for it.** A deterministic parser handles common phrasings in under a millisecond — offline, free, covering English, Hindi and Spanish. It scores its confidence and, below a threshold, escalates to Gemini Flash with a schema-constrained response. Results are cached, so an unusual phrasing is paid for once; five of six demo commands never touch the network. The UI shows which engine answered and how fast, making the architecture visible without reading code.

Both parsers emit one `Intent` contract, and the executor cannot tell them apart. That seam makes the LLM fallback a swappable `IntentProvider` — Gemini by default, since it needs no billing account — and makes the pipeline testable offline, which is how 191 tests run with no database and no API key.

**Recommendations worth trusting.** Replenishment is fitted from real inter-purchase intervals: *"You buy bread about every 6 days — it has been 7."*

**Degradation is designed.** No API key, database, microphone or network — each has defined, honest behaviour, reported at `/api/health`.

Items store under English canonical keys, so categories, prices and history work identically in any language.
