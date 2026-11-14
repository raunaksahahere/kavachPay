import { eq, sql } from 'drizzle-orm';
import { APP_CONFIG, type Lang } from '@/config/app';
import type { Db } from '@/db/client';
import { accounts, ledgerEntries, transactions, users } from '@/db/schema';
import { appendAudit } from '@/lib/audit/chain';
import { AppError } from '@/lib/errors';
import { hashPin } from '@/lib/security/pin';

export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/;

/** A suggested UPI handle from a name or email: lowercase, safe characters only. */
export function suggestHandle(source: string): string {
  const base = source
    .toLowerCase()
    .split('@')[0]
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^[^a-z0-9]+|[._-]+$/g, '')
    .slice(0, 24);
  return base.length >= 3 ? base : `user${base}`.padEnd(3, '0');
}

export type OwnAccount = { userId: string; accountId: string; vpa: string; name: string; language: Lang };

export async function findOwnAccount(db: Db, clerkUserId: string): Promise<OwnAccount | null> {
  const [row] = await db
    .select({ userId: users.id, name: users.name, language: users.language, accountId: accounts.id, vpa: accounts.vpa })
    .from(users)
    .innerJoin(accounts, eq(accounts.userId, users.id))
    .where(eq(users.clerkUserId, clerkUserId));
  return row ?? null;
}

/**
 * Creates the signed-in user's own account: a fresh UPI ID, a hashed PIN and
 * a simulated opening balance moved from the system funding account with
 * normal double-entry ledger rows. Calling it again returns the same account.
 */
export async function createOwnAccount(
  db: Db,
  input: { clerkUserId: string; name: string; handle: string; pin: string; language: Lang },
): Promise<OwnAccount> {
  const existing = await findOwnAccount(db, input.clerkUserId);
  if (existing) return existing;

  const handle = input.handle.trim().toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) {
    throw new AppError(400, 'invalid_handle', 'UPI ID must be 3 to 30 characters: letters, numbers, dot, dash or underscore.');
  }
  const vpa = `${handle}@kavach`;
  const [taken] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.vpa, vpa));
  if (taken) throw new AppError(409, 'vpa_taken', `${vpa} is already taken. Try another.`);

  const pinHash = await hashPin(input.pin);
  const opening = APP_CONFIG.openingBalancePaise;

  try {
    return await db.transaction(async (tx) => {
      let [treasury] = await tx.select().from(accounts).where(eq(accounts.vpa, 'treasury@kavach'));
      if (!treasury) {
        [treasury] = await tx.insert(accounts).values({ vpa: 'treasury@kavach', kind: 'system' }).returning();
      }
      const [user] = await tx
        .insert(users)
        .values({
          clerkUserId: input.clerkUserId,
          name: input.name.trim().slice(0, 80) || handle,
          phone: '',
          kind: 'person',
          language: input.language,
          pinHash,
          isDemo: false,
        })
        .returning();
      const [account] = await tx.insert(accounts).values({ userId: user.id, vpa }).returning();

      const [funding] = await tx
        .insert(transactions)
        .values({
          type: 'funding',
          status: 'settled',
          payerAccountId: treasury.id,
          payeeAccountId: account.id,
          amountPaise: opening,
          note: 'Simulated opening balance',
          settledAt: new Date(),
        })
        .returning();
      await tx
        .update(accounts)
        .set({ balancePaise: sql`${accounts.balancePaise} - ${opening}` })
        .where(eq(accounts.id, treasury.id));
      await tx
        .update(accounts)
        .set({ balancePaise: sql`${accounts.balancePaise} + ${opening}` })
        .where(eq(accounts.id, account.id));
      await tx.insert(ledgerEntries).values([
        { txnId: funding.id, accountId: treasury.id, amountPaise: -opening },
        { txnId: funding.id, accountId: account.id, amountPaise: opening },
      ]);
      await appendAudit(tx, {
        actor: `clerk:${input.clerkUserId}`,
        action: 'account.created',
        entityType: 'account',
        entityId: account.id,
        payload: { vpa, openingBalancePaise: opening },
      });
      return { userId: user.id, accountId: account.id, vpa, name: user.name, language: input.language };
    });
  } catch (err) {
    // Two tabs racing: the unique constraints decide; report the friendly error or the winner.
    const code = (err as { cause?: { code?: string }; code?: string }).cause?.code ?? (err as { code?: string }).code;
    if (code === '23505') {
      const again = await findOwnAccount(db, input.clerkUserId);
      if (again) return again;
      throw new AppError(409, 'vpa_taken', `${vpa} is already taken. Try another.`);
    }
    throw err;
  }
}
