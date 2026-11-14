# Kavach Pay — Build progress

Started 14 November 2026. Each phase lists what was built, how it was verified, and what remains.

## Phase 0 — Decisions

- Git author `raunaksahahere <raunaksaha22@gmail.com>`, repository https://github.com/raunaksahahere/kavachPay (pushed by Raunak later).
- Database: Neon for the app; a local Postgres container for automated tests.
- Languages: English, Hindi, Bengali. Deployment: Vercel.
- Open: team name and members (not needed after the PDF was approved), Gemini key tier.

## Phase 1 — Research ✅

- `docs/research.md`: UPI fraud scale, collect requests, mule accounts, existing safeguards and gaps, Gemini API state, payment engineering. Every claim tagged to a source; primary and secondary sources marked; unconfirmed figures labelled unverified and left out.
- Key findings that changed the build: P2P collect was discontinued on real UPI from 1 Oct 2025; RBI's April 2026 discussion paper proposes blanket friction (1-hour lag above ₹10,000); Google now recommends the Interactions API over `generateContent`; `store` defaults to true, so we send `store: false`.

## Phase 2 — Idea PDF ✅

- `/home/raunak/Desktop/Kavach-Pay-Idea.pdf`, 6 pages, built by `scripts/build-idea-pdf.mjs` from `docs/idea-brief.md` with `docs/architecture.svg`.
- Verified by rendering every page to PNG and inspecting it; layout issues fixed. Approved by Raunak.

## Phase 3 — Scaffold ✅

- Next.js 16.4.6, TypeScript strict, Tailwind 4, Drizzle, Zod, `@google/genai` 3.3, Vitest 5, Playwright 1.65.
- Schema with SQL guards: non-negative balance `CHECK`, deferred zero-sum ledger trigger, append-only triggers on `ledger_entries` and `audit_log`.
- Verified: migrations apply to an empty database; app boots; first commit authored by `raunaksahahere` with no attribution.

## Phase 4 — Ledger, payments, collect, idempotency, state machine ✅

- Settlement in one database transaction with `FOR UPDATE` row locks in a fixed order; Argon2id PIN with lockout; Postgres-backed rate limits.
- Verified (`tests/ledger.test.ts`, `tests/payments.test.ts`): sequential and 5-way concurrent double submit debit once; two different keys for one payment debit once; 20 concurrent ₹100 payments from a ₹1,000 balance settle exactly 10; opposing transfers do not deadlock; entries sum to zero per transaction and overall; balances equal the sum of entries; the database rejects a negative balance, an unbalanced entry and edits to ledger rows.

## Phase 5 — Audit hash chain ✅

- SHA-256 chain over canonical row content; advisory lock serialises appends.
- Verified (`tests/audit.test.ts`): changing a payload or actor fails verification at that exact row; deleting a row fails at the next row; ordinary UPDATE/DELETE are refused; 25 concurrent appends keep the chain valid.

## Phase 6 — Deterministic seed ✅

- Seed `20261114`: 200 users, 5,043 labelled payments over 30 days (plus 2,416 older unlabelled relationship payments and opening balances), with a mule ring (1 hub, 5 mules, 40 victims, 1 cash-out), 26 keyword refund scams, 22 paraphrased refund scams, 4 takeover bursts, 69 legitimate high-value payments, legitimate bursts and legitimate collect notes containing trigger words.
- Verified (`tests/seed.test.ts`): identical fingerprint across runs and across days; identical counts on reload; ledger invariants hold; the demo refund request to Asha is held.

## Phase 7 — Risk engine R1–R7 ✅

- Pure rules over facts; facts built by one SQL query (live) or an in-memory index (batch), with a parity test proving both give identical facts.
- Verified (`tests/risk-rules.test.ts`): each rule fires and stays silent at its thresholds; combined scenarios; templates exist for every rule in every language.
- `npm run eval:rules` (latest run in `docs/eval.md`): precision 85.7%, recall 71.0%, false-positive rate 0.4%, no legitimate payment held. Rules alone catch 0% of the 22 paraphrased refund scams.

## Phase 8 — Gemini layer ✅ (code and tests) / ⏳ (live run)

- G1 analyzer, G2 grounded explainer, G3 read-only copilot, all in `src/lib/ai`, Interactions API, `store: false`, 4-second timeout, demo cache.
- Verified (`tests/ai.test.ts`, `tests/payments.test.ts`): invalid, extra-field and wrong-type outputs are dropped; timeouts and network errors are reported, not thrown; forged delimiters are stripped; images are sent as inline image parts; the cache replays and labels results; a model that calls a scam "safe" cannot lower the score; R8 is capped; an explanation with an invented number falls back to the template; the copilot has only read tools, validates arguments, and stops at 6 steps; the app runs with no key.
- Remaining: a live run against the Gemini API needs `GEMINI_API_KEY` in `.env.local`.

## Phase 9 — AI evaluation ⏳

- `eval/messages/messages.json`: 86 labelled synthetic items: 80 text messages (50 scam, 30 legitimate; English, Hindi, Bengali, Hinglish; three prompt-injection attempts) and 6 rendered chat screenshots.
- `npm run eval:ai` computes extractor accuracy, rules vs rules + R8 on the transaction set, and grounding pass rate, and writes `docs/eval.md`.
- Remaining: run it once the key is available.

## Phase 10 — UI and PWA ✅

- Phone-frame user app (pay, request, collect inbox, check-a-message with screenshot upload, allow / warn / hold sheet with cooling-period timer, language toggle, demo-user switcher).
- Analyst dashboard (stats, flagged table with rule trace, mule network graph with table fallback, audit verify, evaluation page, copilot with tool trace).
- PWA: web app manifest, icons (including maskable), service worker that caches only the shell and never API responses, offline page, security headers.
- Verified: `npm run lint`, `npm run typecheck` and `npm run build` clean; Playwright (8 tests, Chrome) covers the scam interception in English, the Hindi allow path, a wrong PIN, the analyst views, HTTP-level idempotency replay, validation errors, rules-only message checking and PWA installability.

## Phase 11 — Deploy and docs ⏳

- `README.md`, `docs/DEMO.md` written.
- Remaining: Vercel deployment needs the Vercel CLI login and the Neon `DATABASE_URL`.

## Known limitations

- Simulated payment rail and synthetic data; metrics describe this dataset only.
- No authentication: the demo-user switcher sends a user id, so anyone with the URL can act as any demo user. Acceptable for a demo, not for production.
- Rate limits use a fixed window in Postgres; adequate for a demo, not tuned for scale.
- The mule rules are our own heuristics.
- The R7 pass-through rule counts any outgoing payment that follows an inflow within 30 minutes, which can over-count for very active merchants (none were flagged in the evaluation).
