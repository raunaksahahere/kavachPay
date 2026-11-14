import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateDataset } from '../src/lib/seed/generate';
import { loadDataset } from '../src/lib/seed/load';
import { createApp } from '../src/server/app';
import { db } from './helpers';

const FRONTEND = 'http://localhost:3000';
const app = createApp({ origins: [FRONTEND], quiet: true });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(path: string, init: RequestInit & { json?: unknown } = {}) {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set('content-type', 'application/json');
  const res = await app.request(path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  const text = await res.text();
  let body: Json = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { text };
  }
  return { res, status: res.status, body };
}

let users: { userId: string; vpa: string; name: string }[] = [];
const persona = (vpa: string) => users.find((u) => u.vpa === vpa)!;

beforeAll(async () => {
  await loadDataset(db(), generateDataset(20261114, new Date()));
  process.env.AUTH_DISABLED = '1';
  users = (await call('/api/demo-users')).body.users;
});

afterAll(() => {
  delete process.env.AUTH_DISABLED;
  delete process.env.DEMO_SESSION_SECRET;
});

describe('service endpoints', () => {
  it('reports health and status', async () => {
    expect((await call('/health')).body.ok).toBe(true);
    const status = await call('/api/status');
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ service: 'kavach-pay-api', database: 'ok', ai: { enabled: false } });
    expect(status.res.headers.get('cache-control')).toBe('no-store');
    expect(status.res.headers.get('x-request-id')).toBeTruthy();
  });

  it('publishes an OpenAPI document covering every route, and docs', async () => {
    const spec = (await call('/openapi.json')).body;
    expect(spec.openapi).toBe('3.1.0');
    for (const path of ['/api/payments', '/api/payments/{id}/confirm', '/api/collect/{id}/approve', '/api/analyst/proof', '/api/copilot']) {
      expect(spec.paths[path], path).toBeTruthy();
    }
    expect((await call('/docs')).body.text).toContain('swagger-ui');
  });

  it('answers unknown routes with JSON 404', async () => {
    const r = await call('/api/nope');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('not_found');
  });

  it('allows the frontend origin and no other', async () => {
    const allowed = await call('/api/status', { headers: { Origin: FRONTEND } });
    expect(allowed.res.headers.get('access-control-allow-origin')).toBe(FRONTEND);
    expect(allowed.res.headers.get('access-control-allow-credentials')).toBe('true');
    const other = await call('/api/status', { headers: { Origin: 'https://evil.example' } });
    expect(other.res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('payments over HTTP (sign-in off)', () => {
  it('never debits twice for the same Idempotency-Key', async () => {
    const ravi = persona('ravi@kavach');
    const before = (await call(`/api/wallet?userId=${ravi.userId}`)).body.me.balancePaise;
    const body = { userId: ravi.userId, payeeVpa: 'sharmakirana@kavach', amountPaise: 15000, note: 'api test', lang: 'en' };
    const key = randomUUID();
    const first = await call('/api/payments', { method: 'POST', json: body, headers: { 'Idempotency-Key': key } });
    const again = await call('/api/payments', { method: 'POST', json: body, headers: { 'Idempotency-Key': key } });
    expect(first.status).toBe(201);
    expect(again.res.headers.get('idempotent-replayed')).toBe('true');
    expect(again.body.txn.id).toBe(first.body.txn.id);

    const confirmKey = randomUUID();
    const confirm = { userId: ravi.userId, pin: '1234', typedAmountPaise: 15000 };
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        call(`/api/payments/${first.body.txn.id}/confirm`, { method: 'POST', json: confirm, headers: { 'Idempotency-Key': confirmKey } }),
      ),
    );
    expect(results.some((r) => r.status === 200)).toBe(true);
    for (const r of results) expect([200, 409]).toContain(r.status);
    const after = (await call(`/api/wallet?userId=${ravi.userId}`)).body.me.balancePaise;
    expect(after).toBe(before - 15000);

    const misuse = await call('/api/payments', { method: 'POST', json: { ...body, amountPaise: 99 }, headers: { 'Idempotency-Key': key } });
    expect(misuse.status).toBe(422);
  });

  it('validates input and requires an Idempotency-Key', async () => {
    const ravi = persona('ravi@kavach');
    const noKey = await call('/api/payments', { method: 'POST', json: { userId: ravi.userId, payeeVpa: 'sharmakirana@kavach', amountPaise: 100, lang: 'en' } });
    expect(noKey.body.error.code).toBe('idempotency_key_required');
    const bad = await call('/api/payments', {
      method: 'POST',
      json: { userId: ravi.userId, payeeVpa: 'nope', amountPaise: -1, lang: 'xx', extra: 1 },
      headers: { 'Idempotency-Key': randomUUID() },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid_request');
    const notJson = await call('/api/collect/00000000-0000-4000-8000-000000000000/approve', { method: 'POST', body: 'hello' });
    expect(notJson.body.error.code).toBe('invalid_json');
  });

  it('holds the seeded "refund" request to Asha and moves no money', async () => {
    const asha = persona('asha@kavach');
    const wallet = (await call(`/api/wallet?userId=${asha.userId}`)).body;
    const scam = wallet.inbox.find((r: Json) => String(r.note).startsWith('Refund for your cancelled order'));
    const approved = await call(`/api/collect/${scam.id}/approve`, { method: 'POST', json: { userId: asha.userId, lang: 'en' } });
    expect(approved.status).toBe(200);
    expect(approved.body.assessment.decision).toBe('hold');
    expect(approved.body.assessment.explanation.headline).toContain('₹4,999 OUT of your account');
    const confirm = await call(`/api/payments/${approved.body.txn.id}/confirm`, {
      method: 'POST',
      json: { userId: asha.userId, pin: '1234', typedAmountPaise: 499900 },
      headers: { 'Idempotency-Key': randomUUID() },
    });
    expect(confirm.status).toBe(423);
    expect((await call(`/api/wallet?userId=${asha.userId}`)).body.me.balancePaise).toBe(wallet.me.balancePaise);
  });

  it('checks a message without Gemini (rules-only mode)', async () => {
    const r = await call('/api/check-message', {
      method: 'POST',
      json: { userId: persona('asha@kavach').userId, lang: 'en', message: { text: 'Refund ready. Approve and enter your UPI PIN.' } },
    });
    expect(r.body.aiStatus).toBe('disabled');
    expect(r.body.basic.findings).toEqual(expect.arrayContaining(['receive_keyword', 'mentions_pin_or_otp']));
  });

  it('proves the ledger, balances, guards and audit chain live', async () => {
    const proof = (await call('/api/analyst/proof')).body;
    expect(proof.ok).toBe(true);
    expect(proof.checks.map((c: Json) => c.id)).toEqual([
      'ledger_zero_sum',
      'ledger_total',
      'balances_match_ledger',
      'no_negative_balances',
      'settled_have_entries',
      'database_guards',
      'audit_chain',
    ]);
    expect(proof.tables.find((t: Json) => t.table === 'ledger_entries').rows).toBeGreaterThan(10000);
  });
});

describe('sessions (sign-in on)', () => {
  beforeAll(() => {
    delete process.env.AUTH_DISABLED;
    process.env.DEMO_SESSION_SECRET = 'api-test-secret';
  });

  it('refuses every protected route without a session, and a forged token', async () => {
    for (const path of ['/api/wallet', '/api/analyst/stats', '/api/analyst/proof', '/api/eval']) {
      expect((await call(path)).status, path).toBe(401);
    }
    expect((await call('/api/wallet', { headers: { Authorization: 'Bearer not-a-real-token' } })).status).toBe(401);
    expect((await call('/api/wallet', { headers: { 'X-Demo-Session': 'forged.value' } })).status).toBe(401);
    expect((await call('/api/session')).body.mode).toBe('signed_out');
  });

  it('starts a demo trial with a cookie or a header, scoped to that persona only', async () => {
    const meera = persona('meera@kavach');
    const asha = persona('asha@kavach');
    const started = await call('/api/demo-session', { method: 'POST', json: { userId: meera.userId } });
    expect(started.status).toBe(200);
    const cookie = started.res.headers.get('set-cookie')!;
    expect(cookie).toContain('kavach_demo=');
    expect(cookie.toLowerCase()).toContain('httponly');

    const viaHeader = await call(`/api/wallet?userId=${asha.userId}`, { headers: { 'X-Demo-Session': started.body.token } });
    expect(viaHeader.body.me.vpa).toBe('meera@kavach');
    expect(viaHeader.body.mode).toBe('demo');

    const viaCookie = await call('/api/session', { headers: { Cookie: cookie.split(';')[0] } });
    expect(viaCookie.body).toMatchObject({ mode: 'demo', user: { vpa: 'meera@kavach' } });

    const ended = await call('/api/demo-session', { method: 'DELETE' });
    expect(ended.res.headers.get('set-cookie')).toContain('kavach_demo=;');
  });

  it('refuses a demo trial for an account that is not a demo persona', async () => {
    const r = await call('/api/demo-session', { method: 'POST', json: { userId: randomUUID() } });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('not_a_demo_account');
  });
});
