# Kavach Pay — Research Notes

Compiled 14 November 2026. Every claim carries a source tag that resolves to a URL in [Sources](#sources).

**How to read the tags.** `[P]` = primary source read directly (regulator, government, official documentation). `[S]` = secondary source (press report of a primary document we could not open). Anything we could not confirm is labelled **unverified** and must not be used in the PDF, README or UI.

---

## 1. UPI fraud landscape in India

### 1.1 Scale of UPI

- In October 2026 UPI processed **25,466.70 million transactions worth ₹31,52,929.46 crore**, with 758 banks live. `[P1]`
- That is a record month; September 2026 was 24,068.38 million / ₹29,37,396.67 crore. `[P1]`

### 1.2 UPI fraud reported to Parliament

Figures given by the Minister of State for Finance in the Lok Sabha, as reported on 15 December 2025 `[S1]`:

| Financial year | Incidents | Amount |
|---|---|---|
| 2021-22 | not reported in source | ₹242 crore |
| 2022-23 | not reported in source | ₹573 crore |
| 2023-24 | 13.42 lakh | ₹1,087 crore |
| 2024-25 | 12.64 lakh | ₹981 crore |
| 2025-26 (to November 2025) | 10.64 lakh | ₹805 crore |

- An earlier reply (shared 25 November 2024) said UPI fraud incidents rose 85% in FY 2023-24 over FY 2022-23. `[S2]`
- Caveat: we read press reports of the replies; the Lok Sabha PDF itself returned a server error when fetched. These are frauds reported by banks into RBI's fraud registry, so they understate what victims report to police (next section).

### 1.3 Digital payment fraud reported by citizens (NCRP)

From the RBI discussion paper "Exploring safeguards in digital payments to curb frauds", 9 April 2026 `[P2]`, quoting National Cyber Crime Reporting Portal data:

| Calendar year | Digital payment frauds | Amount |
|---|---|---|
| 2021 | 2.6 lakh | ₹551 crore |
| 2022 | 6.9 lakh | ₹2,290 crore |
| 2023 | 13.1 lakh | ₹7,465 crore |
| 2024 | 24 lakh | ₹22,848 crore |
| 2025 | 28 lakh | ₹22,931 crore |

- Transactions above ₹10,000 are about 45% of reported fraud cases by volume and about 98.5% by value; transactions above ₹50,000 are about 92% of value. `[P2]`
- These are all digital payment channels, not UPI alone.
- In 2025, 1,03,488 senior citizens reported financial cyber fraud losses of ₹4,005.12 crore and 4,63,114 women reported ₹3,764.51 crore (MHA reply in the Rajya Sabha, NCRP data). `[S3]`
- The Citizen Financial Cyber Fraud Reporting and Management System (helpline 1930, launched 2021) has saved more than ₹7,000 crore across more than 23 lakh complaints, per a Rajya Sabha reply reported 17 December 2025. `[P3]`

### 1.4 Common scam types

RBI's public booklet "BE(A)WARE" (7 March 2022) lists the modus operandi we target `[P4]` (read via search excerpts of the booklet, not the full PDF):

- **"Request money" / collect scams.** A fraudster posing as a buyer or a refund agent sends a UPI money request and persuades the victim to approve it. The booklet's warning: if an app asks you to enter your PIN to complete a transaction, you are sending money, not receiving it.
- **QR code scams.** Victim is told to scan a QR code "to receive" a payment.
- **Screen-sharing / remote-access apps.** Victim installs an app that lets the fraudster see or control the device.
- **KYC / OTP phishing and impersonation** of banks, telecom staff or officials to extract credentials.
- **Mule accounts** are how the proceeds are moved (section 3).

Not used: an I4C projection of ₹1.2 lakh crore losses for 2025 appears in one press report only. **Unverified.**

---

## 2. How collect requests work, and why victims confuse approve with receive

- UPI supports **push** transactions (payer initiates) and **pull** transactions, where the payee initiates a request and "the payer authorises it by entering their UPI PIN". `[S4]`
- The confusion: the victim is primed to expect money ("refund", "cashback", "prize"). A request arrives showing the expected amount, with an Approve button and a PIN prompt. Entering a PIN feels like "accepting" the money. RBI's own guidance exists precisely because users do not know that a PIN is only ever needed to pay. `[P4]`
- NPCI had already capped P2P collect at ₹2,000 per transaction with a daily cap of 50 successful credit transactions. `[S4]`
- **NPCI then removed the feature.** A circular dated 29 July 2025 states: "By October 1, 2025, UPI P2P Collect shall not be allowed to be processed in UPI." Members and apps were told to stop initiating, routing or processing P2P collect. The stated reason was that collect requests were exploited to make users approve payments they never intended. **Merchant collect requests remain allowed.** `[S4]`
  - Caveat: our sources are August 2025 reports of the circular. We could not open NPCI's circular list (the page did not render), so we have not independently confirmed implementation on the date.

**Why this matters for us.** The regulator's answer to approve/receive confusion was to delete the feature for everyone, because warnings did not work. Pull payments still exist (merchant collect, mandates), and the larger problem has moved to authorised push payments.

---

## 3. Mule accounts

- A mule account receives fraud proceeds and passes them on. An I4C advisory of 3 November 2026 describes stolen funds being sent to mule accounts across different banks and then quickly moved or withdrawn. `[S5]`
- **MuleHunter.AI** (Reserve Bank Innovation Hub) is "an AI/ML-powered mule account detection system designed to help banks proactively identify and block mule accounts with higher accuracy and lower false positives than existing systems". It is trained on account, customer and transaction data plus labelled mule accounts, and is wrapped in a fixed business-rule engine that the bank sets around the model. `[P5]`
  - It was reported to study 19 behaviour patterns of mule accounts. `[S6]`
  - 23 banks had implemented it as of 10 December 2025 (RTI reply); RBI declined to disclose how many mule accounts were found. `[S6]`
  - RBIH's page of mule account indicators (eleven high-risk, four low-risk) is restricted to onboarded banks, so we did not read it. **Our R5–R7 thresholds are our own design, not RBI's list.**
- I4C and RBIH signed an MoU on 12 May 2026 for I4C to share Suspect Registry identifiers to improve models such as MuleHunter.AI. `[S7]` Counts of mule accounts in the registry vary between press reports. **Unverified, not used.**
- **Regulatory direction.** The RBI discussion paper proposes an annual aggregate credit ceiling of ₹25 lakh per individual account, with excess held as "shadow credit" and reversed after 30 days unless the beneficiary satisfies the bank. `[P2]` This is a proposal, not a rule.
- **Detection signals we implement** (standard money-flow reasoning, matching the "receive from many, forward quickly" behaviour above): many distinct first-time senders into one young account (fan-in), and most of the inflow forwarded within minutes (pass-through).

---

## 4. What exists today, and the gaps

### 4.1 Safeguards in place

- Device binding of mobile number to device, two-factor authentication through the UPI PIN, daily transaction limits, and limits on use cases. `[S1]`
- NPCI offers banks an AI/ML fraud-monitoring solution that generates alerts and declines. `[S1]`
- RBI's Central Payments Fraud Information Registry, operational since March 2020. `[S2]`
- **Financial Fraud Risk Indicator** (Department of Telecommunications, announced 21 May 2025): rates a *mobile number* Medium, High or Very High risk and shares it with UPI platforms. PhonePe blocks payments to "Very High" numbers and is building warnings for "Medium". Paytm and Google Pay were reported as integrating it, without detail on block versus warn. `[S8]`
- P2P collect removed from 1 October 2025 (section 2). `[S4]`
- 1930 helpline and CFCFRMS for recovery after the fact. `[P3]`

Not used: a ₹5,000 cap for the first 24 hours of a new UPI registration, and mandatory display of the payee's bank-registered name, appear in secondary articles without a circular reference. **Unverified.**

### 4.2 What RBI is now considering (9 April 2026 discussion paper) `[P2]`

| Proposal | Detail |
|---|---|
| Lagged credit | Mandatory 1-hour delay at the payer's bank on authorised push transfers of about ₹10,000 and above by individuals; payer can cancel during the lag; merchant payments, mandates and cheques exempt; payer may whitelist a payee |
| Trusted person | Mandatory for citizens aged 70+ and persons with disabilities on transfers above ₹50,000; 24-hour cooling period to change the trusted person |
| Credit ceiling | ₹25 lakh a year per account, excess held as shadow credit |
| Kill switch | One control to disable all digital payments on an account |

Comments closed 8 May 2026. We found no final rule. The paper cites the "golden hour" principle for the 1-hour window.

### 4.3 The gaps (our argument)

1. **Friction is blanket, not risk-based.** A flat 1-hour lag above ₹10,000 delays a tenant paying rent exactly as much as a victim paying a scammer. Removing P2P collect removed a useful feature from honest users.
2. **Signals are about the phone number or the account, not this payment.** FRI scores a mobile number. Nothing a user sees today combines "you have never paid this person", "this account is days old", "37 strangers paid it today" and "the message you received says refund" at the moment of approval.
3. **Warnings are generic and often in English.** RBI's advice is a booklet. The moment that matters is the 10 seconds before the PIN is entered, and the warning must say *why this specific payment* is risky, in the user's language.
4. **Protection after the fact.** 1930 and the fraud registry work on reported fraud. Recovery is partial at best; the cheapest rupee to protect is the one that has not left yet.
5. **Smaller banks and PSPs** do not have in-house fraud analytics teams; investigation of a flagged account is manual.

---

## 5. Gemini API, current state (read 14 November 2026)

All `ai.google.dev/gemini-api/docs/*` URLs now redirect to `aistudio.google.com/docs/*`.

### 5.1 API surface: this changed

- The **Interactions API** is "Generally Available and the recommended interface for all new projects" as of June 2026. `generateContent` is "considered legacy" but "remains fully supported"; no shutdown date is given. `[P6]` `[P7]`
- Call shape: `client.interactions.create({ model, input, system_instruction, generation_config, response_format, tools, store, previous_interaction_id })`, with snake_case fields. Output is read from `interaction.output_text` and `interaction.steps`. `[P6]` `[P8]`
- **`store` defaults to `true`** (retained 55 days on paid, 1 day on free). We set `store: false` on every call and resend history ourselves. `[P6]`
- SDK: `@google/genai` (install `npm install @google/genai`); Interactions needs version 2.3.0 or later; SDK 3.0.0 needs Node 22 or later. The older `@google/generativeai` package is deprecated. `[P9]` `[P10]`

### 5.2 Models

| Use | Model ID | Why (from the docs) |
|---|---|---|
| Live checks: G1 analyzer, G2 explainer | `gemini-3.5-flash-lite` | Stable. "Our fastest, most cost-effective 3.5 model for high-throughput execution." Supports structured outputs, function calling, image input. Default thinking is `minimal`, which suits a 4-second budget. Free tier available. $0.30 in / $2.50 out per 1M tokens. `[P11]` `[P12]` `[P13]` |
| Analyst copilot: G3 | `gemini-3.8-flash` (default) | Stable. Function calling, structured outputs, thinking low/medium/high. **Available on the free tier.** $0.75 in / $3.75 out per 1M tokens until 31 Dec 2026. `[P12]` `[P14]` |
| Analyst copilot upgrade | `gemini-4-argon` (opt-in via env) | "Our efficient Gemini 4 frontier reasoning model". Stronger multi-step reasoning, but **not available on the free tier**; $2.00 in / $10.00 out until 30 Nov 2026, doubling on 1 Dec 2026. `[P12]` `[P15]` |

- Not chosen: `gemini-4-carbon` (strongest, but paid-only and slowest); `gemini-2.5-flash` and `gemini-2.5-pro` (shut down 1 December 2026). `[P16]`
- Model IDs live in `src/config/` and can be overridden by environment variable, because the free/paid tier of the demo key decides whether Gemini 4 can be used at all.

### 5.3 Features we use

- **Structured output:** `response_format: { type: 'text', mime_type: 'application/json', schema: <JSON Schema> }`. The docs build the schema from Zod with `z.toJSONSchema(...)` and parse with `schema.parse(JSON.parse(interaction.output_text))`. Supported keywords include `type`, `properties`, `required`, `items`, `enum`, `description`, `anyOf`. `[P8]`
- **Function calling:** tools are flat objects `{ type: 'function', name, description, parameters }`. The model returns steps with `type: 'function_call'` (`name`, `arguments`, `id`). Results go back as `{ type: 'function_result', name, call_id, result: [{ type: 'text', text }] }`. Stateless mode resends the prior steps unmodified (needed to preserve thought signatures). `tool_choice` under `generation_config`: `auto`, `any`, `none`, `validated`. `[P17]`
- **Image input:** an input part `{ type: 'image', data: <base64>, mime_type: 'image/png' }`. Inline data limits the whole request to 20 MB. `[P18]`
- **System instruction:** top-level `system_instruction`. `[P19]`
- **Thinking:** `generation_config: { thinking_level }`. `minimal` is supported on `gemini-3.5-flash-lite` but not on `gemini-3.8-flash` or Gemini 4. Lowering the thinking level is preferred over a small `max_output_tokens`. `[P20]`
- **Sampling:** Gemini 3.6+ and Gemini 4 ignore `temperature`, `top_p`, `top_k`. We send none. `[P19]`
- **Safety settings:** `safety_settings: [{ type, threshold }]`; categories `harassment`, `hate_speech`, `sexually_explicit`, `dangerous_content`, `jailbreak`; default threshold is Off for Gemini 2.5 and later. A blocked call fails with HTTP 400. Scam messages are legitimately about fraud, so we leave defaults and treat a block as "AI check unavailable". `[P21]`
- **Rate limits:** per project, and "can be viewed in Google AI Studio"; the docs page does not list per-model numbers. `[P22]` We therefore throttle the eval script and cache results.
- **Timeouts:** the docs pages do not document a timeout or abort option. We enforce the 4-second budget ourselves and confirm the SDK's request options from its type definitions when installed.

---

## 6. Payment-system engineering

- **Double entry.** "For each currency within a Ledger Transaction, credits will always equal debits", and an account's balance equals the sum of its entries. Posted entries cannot be changed or removed. `[P23]`
- **Idempotency.** A timed-out request is ambiguous to the client; the fix is to retry with the same ID and have the server return the stored result. `[P24]` Stripe saves the first response per key, compares parameters on reuse and errors if they differ, and suggests V4 UUIDs. `[P25]` The IETF `Idempotency-Key` draft (revision 08, an active Internet-Draft, not an RFC) recommends HTTP 422 for a key reused with a different payload and HTTP 409 for a retry while the first request is in progress. `[P26]`
- **Postgres isolation.** Read Committed is the default. Under it, a second updater of the same row waits for the first transaction, then re-evaluates its `WHERE` clause. Repeatable Read and Serializable instead raise a serialization failure (SQLSTATE 40001) that the application must retry. `[P27]`
- **Row locks.** `SELECT ... FOR UPDATE` prevents the locked rows from being locked, modified or deleted by other transactions until the current one ends. Deadlocks are avoided by acquiring locks on multiple objects in a consistent order. `[P28]`
- **Constraints.** A `CHECK` constraint makes the database raise an error on a violating write; it cannot reference other rows. `[P29]`
- **PIN hashing.** OWASP recommends Argon2id with at least 19 MiB memory, 2 iterations, parallelism 1; bcrypt only for legacy systems. `[P30]`
- **Tamper evidence.** Append-only logs in which each record commits to its predecessor by hash make any later edit detectable; Certificate Transparency uses the same idea with a Merkle tree. `[P31]`

---

## Design implications

1. **Reframe the pitch around risk-based friction.** NPCI deleted P2P collect and RBI is proposing a blanket 1-hour lag. Kavach Pay demonstrates the alternative: friction only where the evidence is, with the reason shown. This is the headline of the PDF.
2. **Model collect requests as merchant-style pull payments.** P2P collect no longer exists on real UPI. Our collect flow stays (it is the clearest demo of approve/receive confusion and merchant collect is still live), but the app and PDF say so honestly, and the same shield covers push payments, where most fraud value now is.
3. **Make ₹10,000 a meaningful line in the demo data.** RBI's own figure is that payments above ₹10,000 are about 98.5% of fraud value. Seed legitimate high-value payments (rent, fees) above that line to show we do not hold them, where a flat lag would.
4. **Use the Interactions API, not `generateContent`**, with `store: false` on every call so nothing is retained server-side.
5. **Two models, IDs in config.** `gemini-3.5-flash-lite` for live checks; `gemini-3.8-flash` for the copilot, with `gemini-4-argon` as an opt-in because it is paid-only.
6. **No sampling parameters, minimal thinking on the live path**, and our own 4-second timeout, since the docs do not promise one.
7. **Read Committed plus `FOR UPDATE` in a fixed account order** for transfers, with a `CHECK (balance >= 0)` as the last line of defence. No retry loop for serialization failures is needed at this isolation level.
8. **Idempotency semantics follow the IETF draft:** same key and same payload returns the stored result; same key with a different payload returns 422; in-flight duplicate returns 409.
9. **Argon2id for the UPI PIN** at OWASP minimum parameters or stronger.
10. **Be explicit that R5–R7 are our heuristics.** RBI's indicator list is not public. The eval reports how they perform on our synthetic data only.
11. **Elderly users are a named audience.** RBI's trusted-person proposal targets citizens aged 70+, and seniors reported ₹4,005 crore of losses in 2025. Language choice and plain-language reasons are core, not polish.

---

## Sources

Primary

- `[P1]` NPCI, UPI Product Statistics (monthly table), read 14 Nov 2026 — https://www.npci.org.in/product/upi/product-statistics
- `[P2]` RBI, "Discussion Paper - Exploring safeguards in digital payments to curb frauds", 9 Apr 2026 — https://rbi.org.in/SCRIPTS/PublicationsView.aspx?id=23810
- `[P3]` News On AIR (Government of India broadcaster), Rajya Sabha reply on CFCFRMS, 17 Dec 2025 — https://www.newsonair.gov.in/over-rs-7000-crore-saved-through-citizen-financial-cyber-fraud-reporting-and-management-system/
- `[P4]` RBI, "BE(A)WARE: A Booklet on Modus Operandi of Financial Frauds", 7 Mar 2022 — https://website.rbi.org.in/documents/87730/39016390/BEAWARE07032022.pdf (press release: https://www.rbi.org.in/scripts/BS_PressReleaseDisplay.aspx?prid=53372)
- `[P5]` Reserve Bank Innovation Hub, MuleHunter.ai documentation — https://docs.rbihub.in/mule-hunter
- `[P6]` Google, Interactions API overview — https://aistudio.google.com/docs/interactions-overview
- `[P7]` Google, Migrate to the Interactions API — https://aistudio.google.com/docs/migrate-to-interactions
- `[P8]` Google, Structured output — https://aistudio.google.com/docs/structured-output
- `[P9]` Google, Gemini API libraries — https://aistudio.google.com/docs/libraries
- `[P10]` Google Gen AI JS SDK README — https://github.com/googleapis/js-genai
- `[P11]` Google, Gemini models — https://aistudio.google.com/docs/models
- `[P12]` Google, Gemini API pricing — https://aistudio.google.com/docs/pricing
- `[P13]` Google, Gemini 3.5 Flash-Lite model card — https://aistudio.google.com/docs/models/gemini-3.5-flash-lite
- `[P14]` Google, Gemini 3.8 Flash model card — https://aistudio.google.com/docs/models/gemini-3.8-flash
- `[P15]` Google, Gemini 4 Argon model card — https://aistudio.google.com/docs/models/gemini-4-argon
- `[P16]` Google, Gemini API deprecations — https://aistudio.google.com/docs/deprecations
- `[P17]` Google, Function calling — https://aistudio.google.com/docs/function-calling
- `[P18]` Google, Image understanding — https://aistudio.google.com/docs/image-understanding
- `[P19]` Google, Text generation — https://aistudio.google.com/docs/text-generation
- `[P20]` Google, Thinking — https://aistudio.google.com/docs/thinking
- `[P21]` Google, Safety settings — https://aistudio.google.com/docs/safety-settings
- `[P22]` Google, Rate limits — https://aistudio.google.com/docs/rate-limits
- `[P23]` Modern Treasury, Ledgers guarantees — https://docs.moderntreasury.com/docs/ledgers-guarantees
- `[P24]` Stripe, "Designing robust and predictable APIs with idempotency" — https://stripe.com/blog/idempotency
- `[P25]` Stripe API reference, Idempotent requests — https://docs.stripe.com/api/idempotent_requests
- `[P26]` IETF, "The Idempotency-Key HTTP Header Field" (draft-ietf-httpapi-idempotency-key-header-08) — https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/
- `[P27]` PostgreSQL documentation, Transaction Isolation — https://www.postgresql.org/docs/current/transaction-iso.html
- `[P28]` PostgreSQL documentation, Explicit Locking — https://www.postgresql.org/docs/current/explicit-locking.html
- `[P29]` PostgreSQL documentation, Constraints — https://www.postgresql.org/docs/current/ddl-constraints.html
- `[P30]` OWASP, Password Storage Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- `[P31]` RFC 6962, Certificate Transparency — https://www.rfc-editor.org/rfc/rfc6962

Secondary (press reports of primary documents)

- `[S1]` NationPress, report of Lok Sabha reply by MoS Finance, 15 Dec 2025 — https://www.nationpress.com/business/indias-upi-fraud-surges-to-rs-805-crore
- `[S2]` CyberPeace, "Domestic UPI Frauds: Finance Ministry Presented Data in Lok Sabha", 2 Dec 2024 — https://cyberpeace.org/resources/blogs/domestic-upi-frauds-finance-ministry-presented-data-in-loksabha (cites https://sansad.in/getFile/loksabhaquestions/annex/183/AU211_sk53e3.pdf)
- `[S3]` The420.in, report of MHA reply in the Rajya Sabha on 2025 losses of senior citizens and women — https://the420.in/india-women-senior-citizens-cyber-fraud-losses-2025/
- `[S4]` Business Today, "NPCI to tighten UPI rules: Peer-to-peer collect feature to end in October", 13 Aug 2025 — https://www.businesstoday.in/personal-finance/banking/story/npci-to-tighten-upi-rules-peer-to-peer-collect-feature-to-end-in-october-489244-2025-08-13
- `[S5]` The Federal, report of I4C advisory of 3 Nov 2026 — https://thefederal.com/category/business/i4c-warns-banks-nbfcs-and-fintech-firms-of-ai-assisted-attacks-payment-apis-261866
- `[S6]` MediaNama, "23 Banks Use MuleHunter.AI, RBI Won't Disclose Mule Data", 30 Dec 2025 — https://www.medianama.com/2025/12/223-rti-23-banks-mulehunter-mule-accounts/
- `[S7]` Business Today, report of I4C–RBIH MoU, 12 May 2026 — https://www.businesstoday.in/technology/story/indian-govt-rbi-innovation-signs-ai-pact-to-tackle-financial-frauds-531090-2026-05-12
- `[S8]` MediaNama, "DoT Launches Financial Fraud Risk Indicator for UPI Fraud", 22 May 2025 — https://www.medianama.com/2025/05/223-dot-financial-fraud-risk-indicator-upi/
