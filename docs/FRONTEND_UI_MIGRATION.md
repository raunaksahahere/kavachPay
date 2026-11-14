# Frontend UI migration guardrails

This document records the boundaries for migrating the approved `kavach-pay-design` interface into `frontend/`. The standalone design project remains unchanged and is reference material only.

## Analyst authorization boundary

### Current behaviour, audited 2026-11-14

- `backend/src/server/app.ts` requires a valid Clerk session or signed demo session for non-public `/api/*` paths when authentication is enabled.
- `frontend/src/proxy.ts` similarly requires a Clerk session or demo cookie for non-public pages, including `/analyst`.
- The analyst route handlers in `backend/src/server/routes/analyst.ts` do not call `currentActor`, inspect a role claim, or constrain their results to a role.
- The current `users` schema has person/merchant and demo attributes, but no analyst-role attribute or role-to-permission mapping.

Therefore, any authenticated Clerk user and any valid demo-session user can currently request analyst data. This is an existing authorization gap. The frontend migration must not represent navigation visibility as authorization, expand endpoint access, or introduce a client-side role convention.

### Separate remediation proposal — not part of this UI migration

1. Confirm the product policy: whether analysts are Clerk organization members, users with a trusted session claim, or a separate internal identity source.
2. Add a server-side authorization policy and enforce it centrally before all analyst routes, including audit, proof, evaluation, network, and copilot endpoints.
3. Add explicit authorization tests for Clerk users, demo users, and unauthenticated callers; decide whether demos should receive a deliberately restricted analyst experience.
4. Only after that policy is approved, conditionally render analyst navigation as a convenience. Server enforcement remains authoritative.

This proposal intentionally makes no schema, Clerk, middleware, or route-access change.

## Payment regression baseline

Before payment UI components are changed, preserve and extend the following test layers:

| Concern | Existing coverage | Required addition before payment UI changes |
| --- | --- | --- |
| Allow / warn / hold decisions | `backend/tests/payments.test.ts`, `backend/tests/risk-rules.test.ts`, `frontend/e2e/scam-interception.spec.ts` | Add a UI assertion for warn typed-amount friction and retain allow/hold selectors. |
| PIN and typed amount | Backend covers ordinary PIN, risky typed amount, wrong PIN, hold cooling period. | Add browser coverage that a mismatched typed amount cannot enable a successful payment. |
| Collect sender/receiver semantics | Backend covers approved collect requests; e2e covers an incoming refund collect. | Add API/browser assertions that approval debits the receiver/payer and credits the requester/payee. |
| Idempotent settlement and duplicate submissions | `backend/tests/ledger.test.ts`, `backend/tests/api.test.ts`, `frontend/e2e/api.spec.ts` cover sequential and concurrent keys. | Keep these unchanged; add UI-level duplicate-click coverage if the new submit presentation changes event handling. |
| Failed API calls and cancellation | Wrong PIN, hold, cancellation and insufficient funds are covered in backend/e2e paths. | Add a browser failure-state assertion for a failed request and confirm no success screen is rendered. |
| False success states | Settlement, ledger and balance checks prove server truth. | Add UI tests for error/cancel paths to ensure `payment-finished` is never rendered as settled without a successful confirm response. |

The deterministic risk engine, ledger, payment state machine, and backend response remain the sole source of payment truth. A UI phase may not infer success from button interaction or a local timer.

## Milestone protocol

Each implementation milestone reports its changed files, preserved functionality, executed tests, visual changes, and known issues. Backend changes are limited to separately approved, read-only analytical queries when required by the analyst overview.
