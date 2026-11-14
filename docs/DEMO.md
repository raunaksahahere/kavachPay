# Kavach Pay — 3-minute demo script

## Before you present (5 minutes earlier)

1. `npm run db:seed` — resets the demo data so the waiting requests are fresh (timestamps are relative to now). It also removes signed-in users' own accounts; they are recreated on the next sign-in.
2. Start the app (`npm run dev`, or open the deployed URL). On phones, use the deployed HTTPS URL and tap **Install app** to add it to the home screen.
3. With Gemini on, set `AI_CACHE=1` and walk through steps 0:20 and 1:30 once. The results are cached, so the live run works on bad Wi-Fi and shows "cached".
4. **Phone 1** (or laptop tab 1): sign-in page → **Demo account trial** → **Asha Devi**.
5. **Phone 2** (or a second browser / private window): **Demo account trial** → **Refund Helpdesk**.
6. Laptop tab: `/analyst` (any session works: a demo trial or your own sign-in).
7. Every demo account's UPI PIN is **1234**.

If Gemini is unreachable, the demo still works: the top-bar badge reads "Rules only (AI off)", and every step behaves the same except the Gemini-specific lines.

---

## 0:00 — The problem (20 s)

"UPI handled 25.47 billion payments in October 2026. In the scams we target, the bank's security works perfectly: the victim personally approves the payment, because someone told them a story. Kavach Pay speaks up in the ten seconds before the money leaves."

## 0:20 — The scam arrives from another phone (60 s)

1. **Phone 2 (Refund Helpdesk)**: tap **Request** → UPI ID `asha@kavach` → amount `4999` → note `Refund for your cancelled order` → **Send request**.
2. **Phone 1 (Asha, app in Hindi)**: within a few seconds the request appears under **Requests for you**, with no reload. Click **EN** so the audience can read it.
3. Tap **Approve**. The red **Payment stopped** sheet appears, risk score 100/100:
   - "Approving this request sends ₹4,999 OUT of your account. You will not receive money."
   - The reasons: it says "refund"; never paid this payee; account created 2 days ago; money from many new senders in 24 hours; forwards most of it within 30 minutes.
   - The rule chips (R1, R2, R5, R6, R7) show where each reason came from.
4. Point out: **no PIN box at all** while the 30-minute cooling period runs.
5. Tap **हि** for Hindi, then **বা** for Bengali: the same warning in the user's language.
6. Tap **Decline this request** → "No money was sent" → **Done**. The balance is unchanged.

(Asha's inbox also already holds a seeded copy of this scam, if you prefer one phone.)

## 1:20 — The honest case (15 s)

1. Asha's inbox: *Sharma Kirana Store* asks for **₹640**, "Order #2207 payment" (Asha shops there).
2. **Approve** → green **Looks safe** → PIN `1234` → **Pay now** → "Payment successful".
3. "Friction only where the evidence is. RBI's proposed one-hour lag would have delayed this payment too."

## 1:35 — What Gemini adds (25 s)

1. Phone 1: **Exit demo** → **Demo account trial** → **Meera Das** (Bengali; tap **EN**). Her request from *Customer Care Desk*: **₹2,500**, *"Double debit correction - accept to get credit"*. No keyword rule matches, and the account is not new, so **rules alone score it 5: allow**.
2. Tap **Approve**. Gemini reads the note as a fake refund request claiming she will *receive* money; the fixed R8 table adds its capped points: amber **Check before you pay**, an **R8** chip, score 30.
3. "Gemini described the message; fixed rules turned that into at most 25 points. It can never lower a score or approve anything." Decline.
4. Optional: **Check a message** → **Attach screenshot** with `eval/messages/images/i01.png` to show screenshot input.

## 2:00 — The analyst view (45 s)

1. Laptop `/analyst`. The first row of **Flagged payments** is the held ₹4,999. Click it: the rule trace with the exact facts, the AI points, and the text the user saw.
2. **Show payee network**: the ring. Red is Refund Helpdesk; amber accounts are days old; money flows into *QuickPay Settlements* and out to *N Traders*. "One hub, five mules, forty victims, all planted in our synthetic data."
3. **Audit log** → **Verify chain** → "Chain intact". "Every state change is hash-chained; editing any row breaks verification at that row."
4. **AI copilot** → the suggestion *"Investigate the account refund.helpdesk@kavach…"*. Show the tool trace: only read tools, at most six steps.

## 2:45 — The numbers (15 s)

**Evaluation** tab: "Every number comes from our scripts on labelled synthetic data. With Gemini, recall rose from 71% to 84% with no extra false positives, and the reworded refund scams went from 0 of 22 caught to 22 of 22."

Close: "Double-entry ledger, idempotent payments, a hash-chained audit log, your own private account behind sign-in, and an AI that can only add caution, never remove it."

---

## Your own account (if asked)

Sign in with Clerk → set your UPI ID, language and PIN → a fresh account with a simulated ₹10,000 balance that only you can use. Two people with their own accounts can request and pay each other by UPI ID. Paying a brand-new account shows **Check before you pay** (R2 + R5): that is the engine working, not a bug.

## Fallbacks

| If… | Do |
|---|---|
| Wi-Fi is down | Run locally with `AI_CACHE=1` (cached results) or without a key (rules only). Steps 0:20, 1:20, 2:00 and 2:45 need no AI. |
| A seeded request is missing | It was already approved or declined. Run `npm run db:seed` again, or send a new one from phone 2. |
| The held payment's 30 minutes are up | It now offers "type the amount + PIN". Reseed or send a fresh request. |
| "Install app" only shows instructions | The browser has not offered its install prompt (needs the HTTPS deployment). Use the browser menu → Install app / Add to Home screen. |
