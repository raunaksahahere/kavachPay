#!/usr/bin/env bash
# Verify the Kavach Pay backend yourself, with nothing but curl and python3.
#
#   ./scripts/api-walkthrough.sh https://<your-api>.onrender.com
#
# It starts a demo-trial session (shared synthetic data), makes a ₹1 payment,
# repeats the same request to show it is not charged twice, confirms it with
# the PIN, shows the double-entry ledger rows, and runs the live backend proof.
set -euo pipefail
API="${1:-http://localhost:4000}"
API="${API%/}"
j() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "1. Service status"
curl -fsS "$API/api/status"; echo

say "2. Start a demo-trial session as Ravi Kumar (no sign-up needed)"
RAVI=$(curl -fsS "$API/api/demo-users" | j "[u['userId'] for u in d['users'] if u['vpa']=='ravi@kavach'][0]")
TOKEN=$(curl -fsS -H 'content-type: application/json' -d "{\"userId\":\"$RAVI\"}" "$API/api/demo-session" | j "d['token']")
H=(-H "X-Demo-Session: $TOKEN" -H 'content-type: application/json')
BEFORE=$(curl -fsS "${H[@]}" "$API/api/wallet" | j "d['me']['balancePaise']")
echo "Balance before: $BEFORE paise"

say "3. Start a ₹1 payment to sharmakirana@kavach (risk-checked, no money moves yet)"
KEY="walkthrough-$(date +%s)"
BODY='{"payeeVpa":"sharmakirana@kavach","amountPaise":100,"note":"API walkthrough","lang":"en"}'
FIRST=$(curl -fsS "${H[@]}" -H "Idempotency-Key: $KEY" -d "$BODY" "$API/api/payments")
TXN=$(echo "$FIRST" | j "d['txn']['id']")
echo "$FIRST" | j "'txn ' + d['txn']['id'] + '  status ' + d['txn']['status'] + '  decision ' + d['assessment']['decision'] + '  score ' + str(d['assessment']['score'])"

say "4. Send the SAME request again (same Idempotency-Key): replayed, not a second payment"
curl -fsS -D - -o /dev/null "${H[@]}" -H "Idempotency-Key: $KEY" -d "$BODY" "$API/api/payments" | grep -i '^idempotent-replayed'

say "5. Confirm with the UPI PIN (the only call that moves money)"
DECISION=$(echo "$FIRST" | j "d['assessment']['decision']")
EXTRA=$([ "$DECISION" = allow ] && echo '' || echo ',"typedAmountPaise":100')
curl -fsS "${H[@]}" -H "Idempotency-Key: $KEY-confirm" -d "{\"pin\":\"1234\"$EXTRA}" "$API/api/payments/$TXN/confirm"; echo
AFTER=$(curl -fsS "${H[@]}" "$API/api/wallet" | j "d['me']['balancePaise']")
echo "Balance after: $AFTER paise (debited $((BEFORE - AFTER)) paise, exactly once)"

say "6. The payment's rule trace, as stored by the risk engine"
curl -fsS "${H[@]}" "$API/api/analyst/txn/$TXN" | j "'score %s (%s), rules: %s' % (d['riskScore'], d['riskDecision'], [r['id'] + ' +' + str(r['points']) for r in (d['assessment'] or {}).get('firedRules', [])])"

say "7. Live backend proof: ledger, balances, guards, audit chain"
curl -fsS "${H[@]}" "$API/api/analyst/proof" | j "'\n'.join(('PASS ' if c['ok'] else 'FAIL ') + c['label'] + '  (' + c['detail'] + ')' for c in d['checks'])"

curl -fsS -X DELETE "$API/api/demo-session" > /dev/null
say "Done. Interactive API docs: $API/docs"
