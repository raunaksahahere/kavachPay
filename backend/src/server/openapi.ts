/**
 * OpenAPI 3.1 description of the API, served at /openapi.json and rendered at
 * /docs so the backend can be explored and called without the frontend.
 */

const json = (schema: object) => ({ content: { 'application/json': { schema } } });
const ok = (description: string) => ({ description, ...json({ type: 'object' }) });
const err = { description: 'Error: `{ error: { code, message } }`', ...json({ $ref: '#/components/schemas/Error' }) };
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const idemHeader = {
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  description: 'Unique per logical request. Retrying with the same key returns the stored result instead of acting twice.',
  schema: { type: 'string', minLength: 8 },
};
const lang = { type: 'string', enum: ['en', 'hi', 'bn'] };
const userId = { type: 'string', format: 'uuid', description: 'Only used when sign-in is switched off (tests). Otherwise the session decides.' };

function op(tag: string, summary: string, extra: Record<string, unknown> = {}) {
  return { tags: [tag], summary, responses: { 200: ok('OK'), 400: err, 401: err }, ...extra };
}

export function openApiDocument(version: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Kavach Pay API',
      version,
      description:
        'Simulated UPI payment rail with a fraud shield. Every payment and collect approval is scored by deterministic rules R1–R7 plus capped Gemini signals (R8) before any money moves. ' +
        'Money endpoints are idempotent; settlement is double-entry with row locks; every state change is written to a hash-chained audit log.\n\n' +
        '**Authentication:** a Clerk session token (`Authorization: Bearer …`), or a demo-trial session: call `POST /api/demo-session` with a demo persona id from `GET /api/demo-users` (browsers get a cookie; other clients send the returned `token` as `X-Demo-Session`).',
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: {
        clerk: { type: 'http', scheme: 'bearer', bearerFormat: 'Clerk session JWT' },
        demoSession: { type: 'apiKey', in: 'header', name: 'X-Demo-Session' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } },
        },
      },
    },
    security: [{ clerk: [] }, { demoSession: [] }],
    tags: [
      { name: 'Service', description: 'Health and status' },
      { name: 'Session', description: 'Sign-in state, own account setup, demo trial' },
      { name: 'Payments', description: 'Pay, confirm, cancel; collect requests' },
      { name: 'AI', description: 'Gemini message analysis' },
      { name: 'Analyst', description: 'Read-only analyst views, backend proof, audit, evaluation, copilot' },
    ],
    paths: {
      '/health': { get: { ...op('Service', 'Liveness'), security: [] } },
      '/api/status': { get: { ...op('Service', 'Database, AI and sign-in status'), security: [] } },
      '/api/session': { get: { ...op('Session', 'Who is using the app: open, clerk, demo or signed_out'), security: [] } },
      '/api/onboard': {
        post: op('Session', 'Create the signed-in user’s own account (once)', {
          requestBody: json({
            type: 'object',
            required: ['name', 'handle', 'pin', 'language'],
            properties: { name: { type: 'string' }, handle: { type: 'string', pattern: '^[a-z0-9][a-z0-9._-]{2,29}$' }, pin: { type: 'string', pattern: '^\\d{4,6}$' }, language: lang },
          }),
        }),
      },
      '/api/demo-users': { get: { ...op('Session', 'Shared synthetic demo personas'), security: [] } },
      '/api/demo-session': {
        post: {
          ...op('Session', 'Start a demo trial as a demo persona'),
          security: [],
          requestBody: json({ type: 'object', required: ['userId'], properties: { userId: { type: 'string', format: 'uuid' } } }),
        },
        delete: { ...op('Session', 'End the demo trial'), security: [] },
      },
      '/api/wallet': { get: op('Payments', 'Balance, recent activity and collect-request inbox', { parameters: [{ name: 'userId', in: 'query', schema: userId }] }) },
      '/api/vpa': { get: op('Payments', 'Registered name for a UPI ID', { parameters: [{ name: 'vpa', in: 'query', required: true, schema: { type: 'string' } }] }) },
      '/api/payments': {
        post: op('Payments', 'Start a payment: risk-scored, no money moves yet', {
          parameters: [idemHeader],
          requestBody: json({
            type: 'object',
            required: ['payeeVpa', 'amountPaise', 'lang'],
            properties: {
              userId,
              payeeVpa: { type: 'string', example: 'sharmakirana@kavach' },
              amountPaise: { type: 'integer', minimum: 1, example: 15000 },
              note: { type: 'string' },
              lang,
              message: { type: 'object', properties: { text: { type: 'string' }, image: { type: 'object' } } },
            },
          }),
        }),
      },
      '/api/payments/{id}/confirm': {
        post: op('Payments', 'Confirm with PIN (and typed amount when warned/held); the only call that moves money', {
          parameters: [idParam, idemHeader],
          requestBody: json({ type: 'object', required: ['pin'], properties: { userId, pin: { type: 'string', example: '1234' }, typedAmountPaise: { type: 'integer' } } }),
        }),
      },
      '/api/payments/{id}/cancel': { post: op('Payments', 'Cancel a payment that has not settled', { parameters: [idParam], requestBody: json({ type: 'object', properties: { userId } }) }) },
      '/api/payments/{id}/voice': {
        get: op('Payments', 'Read the risk decision for one of your payments aloud (ElevenLabs, audio/mpeg); 503 when no ElevenLabs key is set', {
          parameters: [idParam, { name: 'lang', in: 'query', required: true, schema: { type: 'string', enum: ['en', 'hi', 'bn'] } }],
        }),
      },
      '/api/transactions/{id}/statement': {
        get: op('Payments', 'PDF of every transaction between you and the other party of this transaction, with official places to report fraud', {
          parameters: [idParam],
        }),
      },
      '/api/collect': {
        post: op('Payments', 'Request money from a UPI ID', {
          parameters: [idemHeader],
          requestBody: json({ type: 'object', required: ['payerVpa', 'amountPaise'], properties: { userId, payerVpa: { type: 'string' }, amountPaise: { type: 'integer' }, note: { type: 'string' } } }),
        }),
      },
      '/api/collect/{id}/approve': {
        post: op('Payments', 'Approve a collect request: starts an outgoing payment and runs the risk check', {
          parameters: [idParam],
          requestBody: json({ type: 'object', required: ['lang'], properties: { userId, lang } }),
        }),
      },
      '/api/collect/{id}/decline': { post: op('Payments', 'Decline a collect request', { parameters: [idParam], requestBody: json({ type: 'object', properties: { userId } }) }) },
      '/api/check-message': {
        post: op('AI', 'Gemini reads a message or screenshot; returns validated signals and the R8 points they would add', {
          requestBody: json({ type: 'object', required: ['lang', 'message'], properties: { userId, lang, message: { type: 'object', properties: { text: { type: 'string' } } } } }),
        }),
      },
      '/api/analyst/stats': { get: op('Analyst', 'Dashboard counts') },
      '/api/analyst/flagged': { get: op('Analyst', 'Flagged payments (warn or hold)', { parameters: [{ name: 'decision', in: 'query', schema: { type: 'string', enum: ['warn', 'hold'] } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }] }) },
      '/api/analyst/txn/{id}': { get: op('Analyst', 'One payment with its full rule trace', { parameters: [idParam] }) },
      '/api/analyst/network': { get: op('Analyst', 'Money-flow network around an account', { parameters: [{ name: 'accountId', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'hops', in: 'query', schema: { type: 'integer' } }] }) },
      '/api/analyst/suspects': { get: op('Analyst', 'Payees receiving the most flagged money') },
      '/api/analyst/proof': { get: op('Analyst', 'Live backend proof: ledger zero-sum, balances match entries, no negatives, database guards, audit chain') },
      '/api/audit': { get: op('Analyst', 'Latest audit-log rows') },
      '/api/audit/verify': { post: op('Analyst', 'Recompute the whole hash chain') },
      '/api/eval': { get: op('Analyst', 'Latest evaluation results (rules only and rules + Gemini)') },
      '/api/copilot': { post: op('Analyst', 'Read-only AI investigation with tool trace', { requestBody: json({ type: 'object', required: ['question'], properties: { question: { type: 'string' } } }) }) },
    },
  };
}

/** Interactive docs (Swagger UI) for /openapi.json. */
export function docsPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Kavach Pay API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>body{margin:0;background:#fff}</style>
</head>
<body>
  <div id="docs"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({ url: '/openapi.json', dom_id: '#docs', withCredentials: true, tryItOutEnabled: true });
  </script>
</body>
</html>`;
}
