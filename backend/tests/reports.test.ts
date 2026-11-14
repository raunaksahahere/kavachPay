import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { riskAssessments } from '../src/db/schema';
import { payToVpa } from '../src/lib/ledger/payments';
import { counterpartyStatement } from '../src/lib/statements/counterparty';
import { renderStatementPdf, scriptRuns } from '../src/lib/statements/pdf';
import { clearVoiceCache, synthesizeSpeech } from '../src/lib/voice/elevenlabs';
import { spokenReason, type SpokenInput } from '../src/lib/voice/script';
import { createApp } from '../src/server/app';
import { daysAgo, db, makeUser, resetDb, rupees, settledTransfer, type TestParty } from './helpers';

const app = createApp({ origins: ['http://localhost:3000'], quiet: true });

let treasuryId: string;
let asha: TestParty;
let desk: TestParty;
let friend: TestParty;

beforeAll(() => {
  process.env.AUTH_DISABLED = '1';
});

beforeEach(async () => {
  ({ treasuryId } = await resetDb());
  asha = await makeUser({ name: 'Asha', balancePaise: rupees(20000), treasuryId });
  desk = await makeUser({ name: 'Refund Desk', openedDaysAgo: 2, balancePaise: rupees(100), treasuryId });
  friend = await makeUser({ name: 'Friend', balancePaise: rupees(1000), treasuryId });
  clearVoiceCache();
});

afterEach(() => {
  delete process.env.ELEVENLABS_API_KEY;
  vi.unstubAllGlobals();
});

/** A held collect-style payment from Asha to the refund desk, with its stored risk trace. */
async function heldPayment() {
  const { txn } = await payToVpa(
    db(),
    { payerAccountId: asha.accountId, payeeVpa: desk.vpa, amountPaise: rupees(4999), note: 'Refund for your order', lang: 'en' },
    { ai: null },
  );
  return txn;
}

describe('spoken reason', () => {
  const input: SpokenInput = {
    decision: 'hold',
    score: 75,
    firedRules: [
      { id: 'R2_NEW_PAYEE', points: 15, facts: {} },
      { id: 'R5_YOUNG_PAYEE', points: 20, facts: { ageDays: 2 } },
    ],
    storedExplanation: null,
    txnType: 'collect',
    amountPaise: 499900,
    payeeName: 'Refund Desk',
  };

  it('builds the words from the stored rule trace, in each language', () => {
    const en = spokenReason(input, 'en');
    expect(en).toContain('Payment stopped.');
    expect(en).toContain('Risk score 75 out of 100.');
    expect(en).toContain('₹4,999 OUT of your account');
    expect(en).toContain('created 2 days ago');
    expect(spokenReason(input, 'hi')).toContain('भुगतान रोका गया');
    expect(spokenReason(input, 'bn')).toContain('পেমেন্ট থামানো হয়েছে');
  });

  it('reuses the on-screen explanation when it is already in the chosen language', () => {
    const stored = { lang: 'hi' as const, headline: 'स्क्रीन वाला शीर्षक', reasons: ['स्क्रीन वाला कारण'], source: 'ai' as const };
    expect(spokenReason({ ...input, storedExplanation: stored }, 'hi')).toContain('स्क्रीन वाला कारण');
    expect(spokenReason({ ...input, storedExplanation: stored }, 'en')).not.toContain('स्क्रीन');
  });
});

describe('ElevenLabs client', () => {
  it('refuses without a key, before any network call', async () => {
    const fetchImpl = vi.fn();
    await expect(synthesizeSpeech('hello', 'en', { fetchImpl })).rejects.toMatchObject({ status: 503, code: 'voice_unavailable' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('calls the convert endpoint with the key, model and language, and caches the clip', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } }));
    const first = await synthesizeSpeech('भुगतान रोका गया।', 'hi', { fetchImpl });
    const second = await synthesizeSpeech('भुगतान रोका गया।', 'hi', { fetchImpl });
    expect([...first.audio]).toEqual([1, 2, 3]);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('test-key');
    expect(JSON.parse(String(init.body))).toEqual({ text: 'भुगतान रोका गया।', model_id: 'eleven_v3', language_code: 'hi' });
  });

  it('turns an upstream error into a clean 502', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    const fetchImpl = vi.fn(async () => new Response('{"detail":"quota"}', { status: 401 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(synthesizeSpeech('x', 'en', { fetchImpl })).rejects.toMatchObject({ status: 502, code: 'voice_failed' });
  });
});

describe('GET /api/payments/:id/voice', () => {
  it('answers 503 when no ElevenLabs key is configured', async () => {
    const txn = await heldPayment();
    const res = await app.request(`/api/payments/${txn.id}/voice?lang=en&userId=${asha.userId}`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('voice_unavailable');
  });

  it('returns MP3 audio for the payer, built from the server-side reason', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    const upstream = vi.fn(async () => new Response(new Uint8Array([9, 9]), { status: 200 }));
    vi.stubGlobal('fetch', upstream);
    const txn = await heldPayment();
    const res = await app.request(`/api/payments/${txn.id}/voice?lang=bn&userId=${asha.userId}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([9, 9]);
    const sent = JSON.parse(String((upstream.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.language_code).toBe('bn');
    expect(sent.text).toContain('₹4,999');
  });

  it('does not read someone else\'s payment', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-key';
    const txn = await heldPayment();
    const res = await app.request(`/api/payments/${txn.id}/voice?lang=en&userId=${friend.userId}`);
    expect(res.status).toBe(404);
  });

  it('rejects an unsupported language', async () => {
    const txn = await heldPayment();
    const res = await app.request(`/api/payments/${txn.id}/voice?lang=fr&userId=${asha.userId}`);
    expect(res.status).toBe(400);
  });
});

describe('counterparty statement', () => {
  it('lists every transaction in both directions with that party only, with totals', async () => {
    const t1 = await settledTransfer(asha.accountId, desk.accountId, rupees(500), daysAgo(3), 'pay', 'advance');
    await settledTransfer(desk.accountId, asha.accountId, rupees(50), daysAgo(2), 'pay', 'वापसी');
    await settledTransfer(asha.accountId, friend.accountId, rupees(300), daysAgo(1));
    const held = await heldPayment();

    const s = await counterpartyStatement(db(), { meAccountId: asha.accountId, txnId: t1 });
    expect(s.counterparty.vpa).toBe(desk.vpa);
    expect(s.rows.map((r) => r.direction)).toEqual(['sent', 'received', 'sent']);
    expect(s.rows.some((r) => r.note === '' && r.amountPaise === rupees(300))).toBe(false);
    expect(s.totals).toMatchObject({ count: 3, sentPaise: rupees(500), receivedPaise: rupees(50) });
    const heldRow = s.rows.find((r) => r.id === held.id)!;
    const [risk] = await db().select().from(riskAssessments).where(eq(riskAssessments.txnId, held.id));
    expect(heldRow.riskDecision).toBe(risk.decision);
    if (risk.decision !== 'allow') expect(heldRow.reasons.length).toBeGreaterThan(0);
  });

  it('is only available to a party of the selected transaction', async () => {
    const t1 = await settledTransfer(asha.accountId, desk.accountId, rupees(500), daysAgo(3));
    await expect(counterpartyStatement(db(), { meAccountId: friend.accountId, txnId: t1 })).rejects.toMatchObject({ status: 404 });
    const res = await app.request(`/api/transactions/${t1}/statement?userId=${friend.userId}`);
    expect(res.status).toBe(404);
  });

  it('downloads as a PDF, including Hindi and Bengali notes', async () => {
    const t1 = await settledTransfer(asha.accountId, desk.accountId, rupees(500), daysAgo(3), 'pay', 'रिफंड के लिए ₹500');
    await settledTransfer(desk.accountId, asha.accountId, rupees(50), daysAgo(2), 'pay', 'ফেরত টাকা');
    const res = await app.request(`/api/transactions/${t1}/statement?userId=${asha.userId}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="kavach-transactions-.+\.pdf"$/);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(5000);
  });

  it('renders many rows across pages', async () => {
    const first = await settledTransfer(asha.accountId, desk.accountId, rupees(10), daysAgo(20));
    for (let i = 0; i < 60; i++) await settledTransfer(asha.accountId, desk.accountId, rupees(10 + i), daysAgo(19 - i / 4));
    const pdf = await renderStatementPdf(await counterpartyStatement(db(), { meAccountId: asha.accountId, txnId: first }));
    expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });

  it('splits mixed-script text into font runs', () => {
    expect(scriptRuns('Refund रिफंड ফেরত ₹5')).toEqual([
      { font: 'latin', text: 'Refund ' },
      { font: 'deva', text: 'रिफंड ' },
      { font: 'beng', text: 'ফেরত ' },
      { font: 'latin', text: '₹5' },
    ]);
  });
});
