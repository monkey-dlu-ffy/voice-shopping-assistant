# Approach

Every voice shopping list can add an item, so I spent the time on the problems underneath.

**Understanding speech without paying for it.** A deterministic parser handles common phrasings in under a millisecond — offline, free, covering English, Hindi and Spanish. It scores its own confidence and, below a threshold, refuses to guess and escalates to Claude Haiku 4.5 via strict tool use. Results are cached, so an unusual phrasing is paid for once; in the demo, five of six commands never touch the network. The UI shows which engine answered and how fast, making the architecture visible without reading code.

Both parsers emit one `Intent` contract, and the executor cannot tell them apart. That seam makes the fallback swappable and the pipeline testable offline — which is how 176 tests run with no database and no API key.

**Recommendations worth trusting.** Replenishment is fitted from real inter-purchase intervals, and every suggestion states its reasoning: *"You buy bread about every 6 days — it has been 7."*

**Degradation is designed.** No API key, database, microphone or network — each has a defined, honest behaviour, reported at `/api/health`.

Items are stored under English canonical keys, so categories, prices and history work identically in any language.
