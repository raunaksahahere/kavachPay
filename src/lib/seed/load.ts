import { sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import {
  accounts,
  collectRequests,
  ledgerEntries,
  riskAssessments,
  transactions,
  txnLabels,
  users,
} from '@/db/schema';
import { appendAudit } from '@/lib/audit/chain';
import { scoreFromFacts } from '@/lib/risk/assess';
import { HistoryIndex } from '@/lib/risk/context-memory';
import { templateExplanation } from '@/lib/risk/explain';
import { hashPin } from '@/lib/security/pin';
import { isLabelled, type Dataset } from './generate';

export const DEMO_PIN = '1234';

function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Replaces everything in the database with the dataset. Historical payments are
 * inserted as settled with their ledger entries, and each one is scored by the
 * same rule engine the live path uses (rules only), as of its own timestamp.
 */
export async function loadDataset(db: Db, data: Dataset): Promise<Record<string, number>> {
  const nameByAccount = new Map<string, string>();
  const userById = new Map(data.users.map((u) => [u.id, u]));
  for (const a of data.accounts) nameByAccount.set(a.id, a.userId ? userById.get(a.userId)!.name : a.vpa);

  const index = new HistoryIndex(
    data.txns.map((t) => ({ ...t, status: 'settled' })),
    new Map(data.accounts.map((a) => [a.id, a.openedAt])),
  );
  const scored = new Map(
    data.txns
      .filter(isLabelled)
      .map((t) => [t.id, scoreFromFacts(index.factsFor(t), null)] as const),
  );

  const balance = new Map<string, number>();
  for (const t of data.txns) {
    balance.set(t.payerAccountId, (balance.get(t.payerAccountId) ?? 0) - t.amountPaise);
    balance.set(t.payeeAccountId, (balance.get(t.payeeAccountId) ?? 0) + t.amountPaise);
  }

  // One hash per distinct user would take a few seconds; hash in small parallel batches.
  const pinHashes = new Map<string, string>();
  for (const batch of chunks(data.users, 16)) {
    const hashes = await Promise.all(batch.map(() => hashPin(DEMO_PIN)));
    batch.forEach((u, i) => pinHashes.set(u.id, hashes[i]));
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      TRUNCATE TABLE txn_labels, risk_assessments, ledger_entries, transactions, collect_requests,
        idempotency_keys, audit_log, ai_calls, rate_limits, accounts, users
      RESTART IDENTITY CASCADE
    `);

    for (const batch of chunks(data.users, 500)) {
      await tx.insert(users).values(
        batch.map((u) => ({
          id: u.id,
          name: u.name,
          phone: u.phone,
          kind: u.kind,
          language: u.language,
          pinHash: pinHashes.get(u.id)!,
          isDemo: u.isDemo,
          demoBlurb: u.demoBlurb,
          createdAt: data.anchor,
        })),
      );
    }
    for (const batch of chunks(data.accounts, 500)) {
      await tx.insert(accounts).values(
        batch.map((a) => ({
          id: a.id,
          userId: a.userId,
          vpa: a.vpa,
          kind: a.kind,
          openedAt: a.openedAt,
          balancePaise: balance.get(a.id) ?? 0,
        })),
      );
    }
    for (const batch of chunks(data.txns, 500)) {
      await tx.insert(transactions).values(
        batch.map((t) => {
          const s = scored.get(t.id);
          return {
            id: t.id,
            type: t.type,
            status: 'settled' as const,
            payerAccountId: t.payerAccountId,
            payeeAccountId: t.payeeAccountId,
            amountPaise: t.amountPaise,
            note: t.note,
            riskScore: s?.score ?? null,
            riskDecision: s?.decision ?? null,
            createdAt: t.createdAt,
            updatedAt: t.createdAt,
            settledAt: t.createdAt,
          };
        }),
      );
      await tx.insert(ledgerEntries).values(
        batch.flatMap((t) => [
          { txnId: t.id, accountId: t.payerAccountId, amountPaise: -t.amountPaise, createdAt: t.createdAt },
          { txnId: t.id, accountId: t.payeeAccountId, amountPaise: t.amountPaise, createdAt: t.createdAt },
        ]),
      );
    }

    const labelled = data.txns.filter(isLabelled);
    for (const batch of chunks(labelled, 500)) {
      await tx.insert(txnLabels).values(
        batch.map((t) => ({ txnId: t.id, isFraud: t.isFraud, scenario: t.scenario })),
      );
      await tx.insert(riskAssessments).values(
        batch.map((t) => {
          const s = scored.get(t.id)!;
          return {
            txnId: t.id,
            score: s.score,
            rulesScore: s.rulesScore,
            aiPoints: 0,
            decision: s.decision,
            firedRules: s.fired,
            aiStatus: 'not_run',
            aiSignals: null,
            explanation: templateExplanation(s.fired, 'en', {
              txnType: t.type === 'collect' ? 'collect' : 'pay',
              amountPaise: t.amountPaise,
              payeeName: nameByAccount.get(t.payeeAccountId) ?? '',
            }),
            createdAt: t.createdAt,
          };
        }),
      );
    }

    await tx.insert(collectRequests).values(
      data.pendingCollects.map((c) => ({
        id: c.id,
        requesterAccountId: c.requesterAccountId,
        payerAccountId: c.payerAccountId,
        amountPaise: c.amountPaise,
        note: c.note,
        createdAt: c.createdAt,
      })),
    );

    await appendAudit(tx, {
      actor: 'seed',
      action: 'seed.completed',
      entityType: 'dataset',
      entityId: String(data.seed),
      payload: { seed: data.seed, anchor: data.anchor.toISOString(), ...data.counts },
    });
  });

  return data.counts;
}
