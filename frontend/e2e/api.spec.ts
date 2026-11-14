import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

async function demoUser(request: APIRequestContext, vpa: string) {
  const res = await request.get('/api/demo-users');
  expect(res.ok()).toBe(true);
  const { users } = await res.json();
  const user = users.find((u: { vpa: string }) => u.vpa === vpa);
  expect(user).toBeTruthy();
  return user as { userId: string; vpa: string };
}

async function balance(request: APIRequestContext, userId: string): Promise<number> {
  const res = await request.get(`/api/wallet?userId=${userId}`);
  return (await res.json()).me.balancePaise;
}

test('HTTP double submit: the same Idempotency-Key never debits twice', async ({ request }) => {
  const ravi = await demoUser(request, 'ravi@kavach');
  const start = await balance(request, ravi.userId);
  const body = { userId: ravi.userId, payeeVpa: 'sharmakirana@kavach', amountPaise: 15000, note: 'e2e', lang: 'en' };

  const createKey = randomUUID();
  const first = await request.post('/api/payments', { data: body, headers: { 'Idempotency-Key': createKey } });
  const again = await request.post('/api/payments', { data: body, headers: { 'Idempotency-Key': createKey } });
  expect(first.status()).toBe(201);
  expect(again.headers()['idempotent-replayed']).toBe('true');
  const created = await first.json();
  expect((await again.json()).txn.id).toBe(created.txn.id);

  const confirmKey = randomUUID();
  const confirm = { userId: ravi.userId, pin: '1234', typedAmountPaise: 15000 };
  const [a, b] = await Promise.all([
    request.post(`/api/payments/${created.txn.id}/confirm`, { data: confirm, headers: { 'Idempotency-Key': confirmKey } }),
    request.post(`/api/payments/${created.txn.id}/confirm`, { data: confirm, headers: { 'Idempotency-Key': confirmKey } }),
  ]);
  const statuses = [a.status(), b.status()].sort();
  expect(statuses[0]).toBe(200);
  expect([200, 409]).toContain(statuses[1]);
  const retry = await request.post(`/api/payments/${created.txn.id}/confirm`, {
    data: confirm,
    headers: { 'Idempotency-Key': confirmKey },
  });
  expect(retry.status()).toBe(200);
  expect(retry.headers()['idempotent-replayed']).toBe('true');

  expect(await balance(request, ravi.userId)).toBe(start - 15000);

  const reused = await request.post('/api/payments', {
    data: { ...body, amountPaise: 99999 },
    headers: { 'Idempotency-Key': createKey },
  });
  expect(reused.status()).toBe(422);
});

test('input is validated and money endpoints require an Idempotency-Key', async ({ request }) => {
  const ravi = await demoUser(request, 'ravi@kavach');
  const noKey = await request.post('/api/payments', {
    data: { userId: ravi.userId, payeeVpa: 'sharmakirana@kavach', amountPaise: 100, lang: 'en' },
  });
  expect(noKey.status()).toBe(400);
  expect((await noKey.json()).error.code).toBe('idempotency_key_required');

  const bad = await request.post('/api/payments', {
    data: { userId: ravi.userId, payeeVpa: 'not a vpa', amountPaise: -5, lang: 'xx', extra: true },
    headers: { 'Idempotency-Key': randomUUID() },
  });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error.code).toBe('invalid_request');

  const notJson = await request.post('/api/collect/00000000-0000-4000-8000-000000000000/approve', {
    data: 'hello',
    headers: { 'Content-Type': 'text/plain' },
  });
  expect(notJson.status()).toBe(400);
});

test('the check-message screen works without Gemini (rules-only mode)', async ({ request }) => {
  const asha = await demoUser(request, 'asha@kavach');
  const res = await request.post('/api/check-message', {
    data: { userId: asha.userId, lang: 'en', message: { text: 'Refund ready. Approve the request and enter your UPI PIN to receive.' } },
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.aiStatus).toBe('disabled');
  expect(body.signals).toBeNull();
  expect(body.basic.findings).toEqual(expect.arrayContaining(['receive_keyword', 'mentions_pin_or_otp']));
});

test('the app is installable: manifest, icons and service worker', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  const m = await manifest.json();
  expect(m.name).toBe('Kavach Pay');
  expect(m.display).toBe('standalone');
  expect(m.start_url).toBe('/');
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBe(true);

  const sw = await request.get('/sw.js');
  expect(sw.ok()).toBe(true);
  expect(sw.headers()['cache-control']).toContain('no-cache');
  expect(await sw.text()).toContain("url.pathname.startsWith('/api/')");
  expect((await request.get('/offline.html')).ok()).toBe(true);

  const api = await request.get('/api/status');
  expect(api.headers()['cache-control']).toContain('no-store');
});
