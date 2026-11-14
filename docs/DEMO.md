# Kavach Pay — 3-minute demo script

## Before you present (5 minutes earlier)

1. `npm run db:seed` — resets the data so the demo requests are fresh (timestamps are relative to now).
2. Start the app (`npm run dev`, or open the deployed URL).
3. With Gemini on, set `AI_CACHE=1` and walk through steps 2 and 4 once. The results are cached, so the live run works on bad Wi-Fi and shows "cached".
4. Open two tabs: `/` (user app) and `/analyst`.
5. Every demo account's UPI PIN is **1234**.

If Gemini is unreachable, the demo still works: the badge in the top bar reads "Rules only (AI off)", and every step below behaves the same except the Gemini-specific lines.

---

## 0:00 — The problem (20 s)

"UPI handled 25.47 billion payments in October 2026. In the scams we target, the bank's security works perfectly: the victim personally approves the payment, because someone told them a story. Kavach Pay speaks up in the ten seconds before the money leaves."

## 0:20 — The scam request (50 s)

1. Tab `/`. The demo user is **Asha Devi** (top-right dropdown). Her app is in Hindi.
2. Point at **"Requests for you"**: *Refund Helpdesk* is asking for **₹4,999**, note *"Refund for your cancelled order #4471"*.
3. Click the **EN** toggle in the phone header so the audience can read it.
4. Click **Approve**.
5. The red **Payment stopped** sheet appears, risk score 100/100:
   - "Approving this request sends ₹4,999 OUT of your account. You will not receive money."
   - The reasons: it says "refund"; never paid this payee; account created 2 days ago; money from 16 new senders in 24 hours; forwarded 90% within 30 minutes.
   - The rule chips (R1, R2, R5, R6, R7) show where each reason came from.
6. Point out: **no PIN box at all** while the 30-minute cooling period runs.
7. Click **हि** to show the same warning in Hindi, then **বা** for Bengali.
8. Click **Decline this request** → "No money was sent" → **Done**. The balance is unchanged.

## 1:10 — The honest case (20 s)

1. Back on the inbox: *Sharma Kirana Store* asks for **₹640**, "Order #2207 payment" (Asha shops there).
2. **Approve** → green **Looks safe** → PIN `1234` → **Pay now** → "Payment successful".
3. "Friction only where the evidence is. RBI's proposed one-hour lag would have delayed this payment too."

## 1:30 — What Gemini adds (30 s)

1. Switch the dropdown to **Meera Das** (Bengali; click **EN** if needed). Her request from *Customer Care Desk*: **₹2,500**, *"Double debit correction - accept to get credit"*. No keyword rule matches this wording, and the account is not new, so **rules alone score it 5: allow**.
2. Click **Approve**. With Gemini on, the analyzer reads the note as a fake refund request that claims she will *receive* money, and the fixed R8 table adds its capped points: the sheet turns amber, **Check before you pay**, with the reason "The message shows signs of a scam (fake refund request)" and an **R8** chip.
3. "Gemini described the message; fixed rules turned that into at most 25 points. It can never lower a score or approve anything." Click **Decline this request**.
4. Optional: Home → **Check a message** → **Attach screenshot** with `eval/messages/images/i01.png` to show multimodal input: scam type, "Says you will RECEIVE money", "Asks for PIN/OTP: Yes".

## 2:00 — The analyst view (45 s)

1. Tab `/analyst`. The first row of **Flagged payments** is Asha's held ₹4,999. Click it: the rule trace with the exact facts, the AI points, and the text the user saw.
2. Click **Show payee network**: the ring. Red is Refund Helpdesk; amber accounts are days old; the money flows into *QuickPay Settlements* and out to *N Traders*. "One hub, five mules, forty victims, all planted in our synthetic data."
3. **Audit log** tab → **Verify chain** → "Chain intact: N rows verified". "Every state change is hash-chained; editing any row breaks verification at that row. Our tests prove it."
4. **AI copilot** tab → click the suggestion *"Investigate the account refund.helpdesk@kavach…"*. Show the tool trace: only read tools, at most six steps.

## 2:45 — The numbers (15 s)

**Evaluation** tab: "Every number here comes from our scripts on labelled synthetic data. Rules alone catch none of the paraphrased refund scams; this table shows exactly what Gemini adds and what it costs in false positives." Read the recall and false-positive rows of the rules vs rules + Gemini table.

Close: "Double-entry ledger, idempotent payments, a hash-chained audit log, and an AI that can only add caution, never remove it."

---

## Fallbacks

| If… | Do |
|---|---|
| Wi-Fi is down | Run locally with `AI_CACHE=1` (cached results) or without a key (rules only). Steps 0:20, 1:10, 2:00 and 2:45 need no AI. |
| A request is missing from the inbox | It was already approved or declined. Run `npm run db:seed` again. |
| The held payment's 30 minutes are up | It now offers "type the amount + PIN". Reseed for a fresh hold. |
