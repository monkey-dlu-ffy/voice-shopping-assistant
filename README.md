# Voice List

A voice-driven shopping list that understands how people actually talk — in English, Hindi and Spanish — and explains every suggestion it makes.

**Live app:** <https://voice-shopping-assistant-fvmh.onrender.com>
**Stack:** TypeScript · React · Express · MongoDB · Gemini Flash · Docker

---

## See it work in 30 seconds

1. Open the app in **Chrome, Edge, or an Android browser** (see [Browser support](#browser-support)).
2. Click **Load demo history** — this seeds 90 days of plausible purchases so the recommendation engine has something to reason about. Without it you would be looking at an empty screen, and the most interesting part of the system would be invisible.
3. Tap the microphone and try, in order:

   | Say this | What to watch |
   |---|---|
   | `add two bottles of water and milk` | Two items, correct quantities and units, auto-filed into aisles |
   | `find toothpaste under $5` | Price filter parsed out of the sentence |
   | `remove milk from my list` | Phrasing varies, intent does not |
   | `grab whatever we need for tacos` | The badge flips from `rules` to `ai` — the rules refused to guess |
   | say it again | The badge flips to `cache` — the same phrasing is never paid for twice |
   | `what's on my list` | Spoken back to you |

4. Switch the language selector to **हिन्दी** and say `दो बोतल पानी चाहिए`. It lands as "2 bottles of water", filed under Drinks — the list is stored in English so categories, prices and history work identically across languages.

The `rules · 3ms` / `ai · 410ms` badge under the transcript is not decoration. It is the architecture, made visible.

---

## The idea

Every voice shopping list can add an item. The interesting problems are the ones underneath:

**How do you understand free-form speech without paying for an LLM call on every "add milk"?**
A deterministic parser handles the common cases in under a millisecond, offline and free. Only phrasings it is genuinely not confident about escalate to a model, and each of those is cached. In the demo script above, five of six commands never touch the network.

**How do you make a recommendation someone will actually trust?**
By showing your working. Every suggestion carries the reason it exists — *"You buy bread about every 6 days — it has been 7"* — computed from real inter-purchase intervals, not picked from a hardcoded list.

**What happens when the clever part is unavailable?**
The app keeps working. No API key, no network, no database: it degrades to the rule parser and in-process storage, and says so honestly at `/api/health` rather than failing.

---

## Architecture

Everything hangs off one abstraction: **the `Intent` contract**. Speech becomes text, text becomes a validated `Intent`, and an executor applies `Intent`s to state. Two entirely independent parsers emit the same shape, which is what makes either of them testable, swappable or removable.

```
  Mic ──► Web Speech API ──► transcript (interim + final)
                                   │
                                   ▼
                          ┌────────────────────┐
                          │   RuleParser       │  shared package,
                          │   (per-language)   │  runs in browser + server
                          └────────┬───────────┘
                       confident?  │
                    ┌──────────────┴──────────────┐
                   yes                            no
                    │                              │
                    │                     ┌────────▼─────────┐
                    │                     │  parse cache     │
                    │                     └────────┬─────────┘
                    │                        miss  │
                    │                     ┌────────▼─────────┐
                    │                     │  Gemini Flash    │
                    │                     │ structured output│
                    │                     └────────┬─────────┘
                    └──────────────┬───────────────┘
                                   ▼
                          Intent { intent, items[], filters,
                                   language, confidence,
                                   source, latencyMs }
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
              List executor   Catalog search   Suggestion engine
                    │              │              │
                    └──────────────┼──────────────┘
                                   ▼
                    { list, actions, speak: "Added 2 bottles of water" }
```

```
packages/shared/     Intent types, rule parser, normalisers, catalogue, fuzzy match
apps/api/            Express, Mongo, LLM provider, suggestion engine, executor
apps/web/            React, Web Speech API, Web Audio waveform
```

`packages/shared` is imported by **both** the browser and the server. One parser, one test suite, two runtimes — which is also what lets the browser show an instant local interpretation while the request is still in flight.

### The hybrid parser, concretely

The rule parser scores its own confidence. Below `CONFIDENCE_THRESHOLD` it refuses to answer and defers.

| Utterance | Result |
|---|---|
| `add 2 bottles of water` | verb + quantity + unit + known item → **0.90, handled locally** |
| `remove caviar` | verb + clean noun → **0.90**; the executor answers "caviar is not on your list" |
| `grab whatever we need for tacos` | verb matched, nothing resolves → **0.40, escalates** |
| `asdfghjkl` | no verb, no item → **0.25, escalates** |

`remove` is confident even for an item the catalogue has never heard of, because the executor validates against the user's own list. `add` is not, because an unrecognised name would go straight onto the list. Confidence answers *"did I understand the command"*, not *"do I stock this product"*.

When the model is consulted, the request is constrained to a JSON schema (Gemini's `responseSchema`, or Anthropic's strict tool use if you configure Claude instead — see [LLM provider](#llm-provider) below), so the output is schema-guaranteed rather than hope-parsed, and it is validated again with Zod on arrival.

### The suggestion engine

Four signals, one ranked list, every entry explainable.

| Signal | How it works | Example reason |
|---|---|---|
| Replenishment | Mean gap between consecutive purchases; surfaces at 80% of a cycle | "You buy bread about every 6 days — it has been 7." |
| Co-purchase | Association pairs, seeded and matched against the current list | "Often bought with pasta." |
| Seasonal | Month-indexed produce calendar | "Mangoes are in season in May." |
| Deals | Flagged catalogue entries | "Coffee is on offer this week." |

The interval model is deliberately a mean, not a curve fit: with a handful of observations per item, anything fancier is fitting noise. Items bought only once are skipped rather than guessed at.

---

## Running it

### One command

```bash
docker compose up
```

Then open <http://localhost:8080>. That is the whole setup — no Node version to match, no database to install, no API key.

### LLM provider

The LLM fallback needs a key from **one** of two providers, tried in this order. Add whichever you have to a `.env` file next to `docker-compose.yml` (see `.env.example` for the full list of variables).

| Provider | Cost | Getting a key |
|---|---|---|
| **Gemini Flash** (preferred) | Genuinely free — no billing account required | Sign in at [aistudio.google.com](https://aistudio.google.com) with a Google account and generate a key. This is a *different* signup path from Google Cloud/Vertex, and does not ask for a card on the free tier. Set `GEMINI_API_KEY`. |
| Claude Haiku 4.5 | Fractions of a cent per fallback call, requires Anthropic billing | Set `ANTHROPIC_API_KEY` instead. Useful if you already have Claude billing configured — the two providers sit behind the same `IntentProvider` interface, so it's a config change, not a code change. |

Neither is required. Without one, the rule parser still handles every phrasing it recognises, and an unusual phrasing gets an honest "I didn't catch that" instead of an error. `/api/health` reports exactly which mode you're running in:

```json
{
  "storage": { "kind": "mongodb", "durable": true },
  "nlp": { "fallback": "gemini:gemini-2.5-flash-lite", "cache": { "hits": 3, "llmCalls": 1 } }
}
```

### Local development

```bash
npm install
npm run dev          # API on :8080, Vite on :5173 with a proxy
```

```bash
npm test             # 191 tests
npm run typecheck
npm run build
```

No database is needed for development — with `MONGODB_URI` unset the app uses in-process storage and warns that lists will not survive a restart.

### Deploying

The image built by the `Dockerfile` is the single deployable artefact — the same one `docker compose` runs locally deploys anywhere that can run a Dockerfile.

**Cloud Run** (needs a GCP billing account on file, even though this workload stays inside the free tier):

```bash
gcloud run deploy voice-list \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars "MONGODB_URI=<your MongoDB Atlas URI>,GEMINI_API_KEY=<key>"
```

Cloud Run supplies HTTPS, which the Web Speech API requires, and scales to zero.

**Render**, if you'd rather not attach a card at all: connect the GitHub repo at [render.com](https://render.com), create a **Web Service**, let it detect the `Dockerfile`, and add the same environment variables in its dashboard. No billing account needed on Render's free tier. Trade-off: the free instance sleeps after 15 minutes idle, so a cold visit waits several seconds for it to wake.

Either way, Cloud Run and Render instances are both stateless, so production needs a managed database — a MongoDB Atlas M0 cluster is free and sufficient. The Mongo container in `docker-compose.yml` is for local use only.

---

## Requirements, and where they live

| Requirement | Where |
|---|---|
| Voice command recognition | `apps/web/src/hooks/useSpeech.ts` |
| NLP for varied phrasing | `packages/shared/src/ruleParser.ts` + `apps/api/src/nlp/` |
| Multilingual | `packages/shared/src/lexicon/` (en, hi, es) |
| Product recommendations from history | `apps/api/src/suggestions/engine.ts` — replenishment |
| Seasonal recommendations | same — seasonal + deals signals |
| Substitutes | `substitutePrompt`, offered inline after adding an item |
| Add / remove / modify by voice | `apps/api/src/executor.ts` |
| Auto-categorisation | `packages/shared/src/catalog.ts` — 131 products across 11 aisles |
| Quantity management | quantity + unit grammar in the rule parser |
| Voice search with brand / size / price | `searchCatalog` + `filters` on the Intent |
| Price range filtering | `maxPricePatterns` per language |
| Minimalist interface | `apps/web/src/styles.css` |
| Real-time visual feedback | live transcript, mic waveform, parse badge, row highlight |
| Mobile / voice-only | bottom-docked mic, hands-free mode with spoken confirmations |
| Error handling | degraded modes below |
| Loading states | optimistic local parse + in-flight badge |

---

## Testing

```
191 tests across 5 files
```

- **`packages/shared/test/nlp.spec.ts`** — 83 utterances across three languages, each asserting the exact `Intent`. This is the evidence behind "understands varied phrasing"; the rest of the claim is just a claim. It includes an *escalation corpus*: phrasings the rules must **refuse**, so the fallback boundary cannot silently drift.
- **`packages/shared/test/catalog.spec.ts`** — resolution, mishearings, cross-language lookup, plus data integrity (no dangling substitutes, no duplicate keys, valid months).
- **`apps/api/test/suggestions.spec.ts`** — the replenishment model recovers the interval it was generated from; cold start still produces something.
- **`apps/api/test/api.spec.ts`** — full request/response cycle against a memory repository and a mock provider. No database, no network, no API key.
- **`apps/api/test/provider.spec.ts`** — error classification for both LLM providers (retryable vs. permanent, by real SDK error class), so a rate limit is never mistaken for a dead API key.

Two real bugs were caught here rather than in a demo: a low-confidence parse being executed anyway (adding a literal item called "whatever tacos"), and `remove caviar` being rejected as incomprehensible when it was perfectly understood.

---

## When things go wrong

Degradation is designed, not accidental.

| Situation | Behaviour |
|---|---|
| No `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` | Rules-only. Unrecognised phrasings ask you to rephrase. Reported at `/api/health`. |
| LLM rate-limited, down, or unreachable | Falls back to the rule result, logged with retryable/permanent classification. |
| No `MONGODB_URI`, or Mongo unreachable | In-process storage, loud warning, `durable: false` at `/api/health`. |
| Microphone permission denied | Banner explaining how to re-enable, text input stays available. |
| Browser without Web Speech API | Same — the text field is always present, never hidden behind an error. |
| Server unreachable | Banner; the list reloads when connectivity returns. |

The text input is not a testing affordance. It is the path for anyone whose browser or permissions rule out the microphone, so it is always on screen.

---

## Browser support

Voice input needs the Web Speech API and an HTTPS origin (or `localhost`).

| Browser | Voice | Notes |
|---|---|---|
| Chrome, Edge, Android Chrome | ✅ | Fully supported |
| Safari (macOS/iOS 14.5+) | ⚠️ | Recognition works; quality varies |
| Firefox | ❌ | No Web Speech API — the app falls back to text input with a banner |

---

## Design decisions

**Rules first, model second.** An LLM on every utterance would cost money per command, add ~400 ms of latency to "add milk", and break entirely offline. Rules-only would be brittle on phrasing the author did not anticipate. The hybrid gets the latency and cost profile of the former with the flexibility of the latter, and the cache means an unusual phrasing is only ever paid for once.

**One `Intent` contract.** The executor has no idea whether an intent came from the rule engine, Gemini or Claude. That is what makes the fallback swappable — Gemini and Claude are two interchangeable implementations of the same `IntentProvider` interface — and the whole pipeline testable without a network.

**English canonical keys.** Whatever language you speak, items are stored against normalised English names. Categorisation, pricing, purchase history and recommendations then work identically across languages instead of needing per-language duplicates, and the UI renders labels back in your language.

**Suggestions must explain themselves.** A recommendation a shopper cannot interrogate is one they will not trust.

**Visual language from the domain.** Categories are set as shelf rules, quantities sit in the left gutter as tabular numerals the way a price sits on a shelf label, and machine facts are set in mono like a till receipt. The palette is drawn from produce — beetroot, olive brine, egg yolk — on cool butcher paper. The waveform is a real oscilloscope trace of your microphone input, not a canned animation.

---

## Trade-offs and what is not here

Honest limits, given the time budget:

- **The catalogue is seeded, not live.** 131 products with indicative prices from public grocery listings. A real deployment would sit behind a retailer's API; `searchCatalog` is the seam.
- **"On sale" is a static flag.** There is no promotions feed.
- **Hindi and Spanish rule packs are narrower than the English one.** They cover the common command shapes; anything outside them escalates to the model, which handles any language.
- **Undo restores the list, not purchase history.** Marking something bought is treated as an append-only record of what actually happened.
- **Sessions are an anonymous cookie.** No accounts, deliberately — a reviewer should not have to sign up. Cross-device sync would need real auth.
- **Co-purchase associations are seeded pairs**, not mined from observed baskets. The engine accepts observed data; there just is not any yet.
- **Smaller free-tier models follow the escalation prompt less reliably than Claude did in development.** On `gemini-2.5-flash-lite`, a vague meal request ("sort out dinner for tonight") occasionally comes back as an empty search instead of expanded grocery items, despite an explicit rule and worked example in the prompt. The `payloadSchema` Zod validation catches a malformed response; it cannot catch a well-formed but wrong one. This is a genuine model-capability gap, not a parsing bug — swapping in `gemini-2.5-pro` (if your key has access to it) or Claude Haiku would very likely fix it, since the `IntentProvider` interface makes that a config change.
