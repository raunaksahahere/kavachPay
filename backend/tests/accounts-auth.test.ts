import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_CONFIG } from '../src/config/app';
import { accounts, ledgerEntries, transactions, users } from '../src/db/schema';
import { createOwnAccount, suggestHandle } from '../src/lib/accounts/onboard';
import { resolveActor } from '../src/lib/auth/actor';
import { signDemoSession, verifyDemoSession } from '../src/lib/auth/demo-session';
import { verifyChain } from '../src/lib/audit/chain';
import { confirmPayment, payToVpa } from '../src/lib/ledger/payments';
import { balanceOf, db, makeUser, resetDb, rupees } from './helpers';

const SECRET = 'test-secret-value';

describe('demo-trial session cookie', () => {
  it('round-trips a persona id', async () => {
    const { value } = await signDemoSession('11111111-1111-4111-8111-111111111111', Date.now(), SECRET);
    expect(await verifyDemoSession(value, Date.now(), SECRET)).toEqual({ userId: '11111111-1111-4111-8111-111111111111' });
  });

  it('rejects a tampered payload, a tampered signature, the wrong secret and garbage', async () => {
    const { value } = await signDemoSession('11111111-1111-4111-8111-111111111111', Date.now(), SECRET);
    const [payload, sig] = value.split('.');
    const forged = Buffer.from(JSON.stringify({ u: '22222222-2222-4222-8222-222222222222', e: Date.now() + 1e9 }))
      .toString('base64url');
    expect(await verifyDemoSession(`${forged}.${sig}`, Date.now(), SECRET)).toBeNull();
    expect(await verifyDemoSession(`${payload}.${sig.slice(0, -2)}AA`, Date.now(), SECRET)).toBeNull();
    expect(await verifyDemoSession(value, Date.now(), 'another-secret')).toBeNull();
    expect(await verifyDemoSession('not-a-cookie', Date.now(), SECRET)).toBeNull();
    expect(await verifyDemoSession(undefined, Date.now(), SECRET)).toBeNull();
  });

  it('expires', async () => {
    const now = Date.now();
    const { value, expires } = await signDemoSession('11111111-1111-4111-8111-111111111111', now, SECRET);
    expect(expires.getTime() - now).toBe(APP_CONFIG.demoSessionHours * 3_600_000);
    expect(await verifyDemoSession(value, expires.getTime() + 1, SECRET)).toBeNull();
  });
});

describe('own accounts for signed-in users', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('suggests a safe UPI handle', () => {
    expect(suggestHandle('Raunak.Saha+test@example.com')).toBe('raunak.saha.test');
    expect(suggestHandle('Ab')).toMatch(/^[a-z0-9][a-z0-9._-]{2,}$/);
  });

  it('creates a fresh account with a hashed PIN and a zero-sum opening balance, once', async () => {
    const own = await createOwnAccount(db(), {
      clerkUserId: 'user_abc',
      name: 'Raunak',
      handle: 'raunak',
      pin: '2468',
      language: 'bn',
    });
    expect(own.vpa).toBe('raunak@kavach');
    expect(await balanceOf(own.accountId)).toBe(APP_CONFIG.openingBalancePaise);

    const [user] = await db().select().from(users).where(eq(users.id, own.userId));
    expect(user).toMatchObject({ clerkUserId: 'user_abc', isDemo: false, language: 'bn' });
    expect(user.pinHash.startsWith('$argon2id$')).toBe(true);

    const [funding] = await db().select().from(transactions).where(eq(transactions.payeeAccountId, own.accountId));
    expect(funding).toMatchObject({ type: 'funding', status: 'settled' });
    const entries = await db().select().from(ledgerEntries).where(eq(ledgerEntries.txnId, funding.id));
    expect(entries.reduce((sum, e) => sum + e.amountPaise, 0)).toBe(0);
    expect((await verifyChain(db())).ok).toBe(true);

    const again = await createOwnAccount(db(), { clerkUserId: 'user_abc', name: 'X', handle: 'other', pin: '1111', language: 'en' });
    expect(again.accountId).toBe(own.accountId);
    const count = await db().execute(sql`SELECT count(*)::int AS n FROM users WHERE clerk_user_id = 'user_abc'`);
    expect(count.rows[0].n).toBe(1);
  });

  it('refuses a taken or invalid UPI ID', async () => {
    await createOwnAccount(db(), { clerkUserId: 'user_1', name: 'A', handle: 'asha', pin: '1234', language: 'en' });
    await expect(
      createOwnAccount(db(), { clerkUserId: 'user_2', name: 'B', handle: 'asha', pin: '1234', language: 'en' }),
    ).rejects.toMatchObject({ code: 'vpa_taken', status: 409 });
    await expect(
      createOwnAccount(db(), { clerkUserId: 'user_3', name: 'C', handle: 'no spaces!', pin: '1234', language: 'en' }),
    ).rejects.toMatchObject({ code: 'invalid_handle' });
  });

  it('gives one account even when two requests race', async () => {
    const results = await Promise.all([
      createOwnAccount(db(), { clerkUserId: 'user_race', name: 'R', handle: 'race.one', pin: '1234', language: 'en' }),
      createOwnAccount(db(), { clerkUserId: 'user_race', name: 'R', handle: 'race.two', pin: '1234', language: 'en' }),
    ]);
    expect(results[0].accountId).toBe(results[1].accountId);
  });

  it('can pay and be paid like any other account', async () => {
    const a = await createOwnAccount(db(), { clerkUserId: 'user_a', name: 'A', handle: 'alpha', pin: '1357', language: 'en' });
    const b = await createOwnAccount(db(), { clerkUserId: 'user_b', name: 'B', handle: 'bravo', pin: '2468', language: 'en' });
    const { txn, assessment } = await payToVpa(
      db(),
      { payerAccountId: a.accountId, payeeVpa: b.vpa, amountPaise: rupees(250), lang: 'en' },
      { ai: null },
    );
    // A brand-new payee account is a real risk signal: warn, not allow.
    expect(assessment.fired.map((r) => r.id)).toEqual(['R2_NEW_PAYEE', 'R5_YOUNG_PAYEE']);
    expect(assessment.decision).toBe('warn');
    await confirmPayment(db(), { txnId: txn.id, payerAccountId: a.accountId, pin: '1357', typedAmountPaise: rupees(250) });
    expect(await balanceOf(b.accountId)).toBe(APP_CONFIG.openingBalancePaise + rupees(250));
  });
});

describe('whose account a request acts on', () => {
  let demoId: string;
  let realId: string;

  beforeEach(async () => {
    const { treasuryId } = await resetDb();
    const persona = await makeUser({ name: 'Persona', treasuryId });
    await db().update(users).set({ isDemo: true }).where(eq(users.id, persona.userId));
    demoId = persona.userId;
    const own = await createOwnAccount(db(), { clerkUserId: 'user_real', name: 'Real', handle: 'real', pin: '1234', language: 'en' });
    realId = own.userId;
  });

  it('trusts the client only when sign-in is off', async () => {
    expect(await resolveActor(db(), { authEnabled: false, clerkUserId: null, demoUserId: null, requestedUserId: demoId })).toEqual({
      userId: demoId,
      mode: 'open',
    });
    await expect(resolveActor(db(), { authEnabled: false, clerkUserId: null, demoUserId: null })).rejects.toMatchObject({
      code: 'user_required',
    });
  });

  it('uses the signed-in user own account and ignores any id the client sends', async () => {
    const actor = await resolveActor(db(), { authEnabled: true, clerkUserId: 'user_real', demoUserId: null, requestedUserId: demoId });
    expect(actor).toEqual({ userId: realId, mode: 'clerk' });
  });

  it('asks a new signed-in user to set up an account', async () => {
    await expect(resolveActor(db(), { authEnabled: true, clerkUserId: 'user_new', demoUserId: null })).rejects.toMatchObject({
      code: 'onboarding_required',
      status: 409,
    });
  });

  it('lets a demo trial reach only demo personas, never a real account', async () => {
    expect(await resolveActor(db(), { authEnabled: true, clerkUserId: null, demoUserId: demoId })).toEqual({
      userId: demoId,
      mode: 'demo',
    });
    await expect(resolveActor(db(), { authEnabled: true, clerkUserId: null, demoUserId: realId })).rejects.toMatchObject({
      code: 'demo_expired',
    });
  });

  it('prefers an explicit demo trial over the signed-in account while it lasts', async () => {
    expect(await resolveActor(db(), { authEnabled: true, clerkUserId: 'user_real', demoUserId: demoId })).toEqual({
      userId: demoId,
      mode: 'demo',
    });
  });

  it('refuses a request with no session', async () => {
    await expect(
      resolveActor(db(), { authEnabled: true, clerkUserId: null, demoUserId: null, requestedUserId: realId }),
    ).rejects.toMatchObject({ code: 'unauthenticated', status: 401 });
  });

  it('keeps every account non-negative after onboarding', async () => {
    const negative = await db().execute(sql`SELECT id FROM accounts WHERE kind = 'user' AND balance_paise < 0`);
    expect(negative.rows).toHaveLength(0);
    void accounts;
  });
});
