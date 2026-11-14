import { sql } from 'drizzle-orm';
import { RISK_CONFIG } from '@/config/risk';
import type { DbOrTx } from '@/db/client';
import type { RiskFacts } from './types';

export type TxnForRisk = {
  id: string;
  type: 'pay' | 'collect' | 'funding';
  amountPaise: number;
  note: string;
  payerAccountId: string;
  payeeAccountId: string;
  createdAt: Date;
};

/**
 * Reads the facts for one payment from the database, as of the payment's own
 * creation time. One round trip. Only earlier, settled payments count, so the
 * same function works for a live payment and for replaying history.
 */
export async function buildFactsFromDb(db: DbOrTx, t: TxnForRisk): Promise<RiskFacts> {
  const asOf = t.createdAt.toISOString();
  const c = RISK_CONFIG;
  const result = await db.execute(sql`
    WITH p AS (SELECT ${asOf}::timestamptz AS as_of)
    SELECT
      (SELECT count(*) FROM transactions x, p
        WHERE x.payer_account_id = ${t.payerAccountId} AND x.payee_account_id = ${t.payeeAccountId}
          AND x.status = 'settled' AND x.type <> 'funding' AND x.created_at < p.as_of) AS prior_to_payee,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x.amount_paise) FROM transactions x, p
        WHERE x.payer_account_id = ${t.payerAccountId} AND x.status = 'settled' AND x.type <> 'funding'
          AND x.created_at < p.as_of
          AND x.created_at >= p.as_of - make_interval(days => ${c.r3.windowDays})) AS median_out,
      (SELECT count(*) FROM transactions x, p
        WHERE x.payer_account_id = ${t.payerAccountId} AND x.status = 'settled' AND x.type <> 'funding'
          AND x.created_at < p.as_of
          AND x.created_at >= p.as_of - make_interval(days => ${c.r3.windowDays})) AS history_count,
      (SELECT count(*) FROM transactions x, p
        WHERE x.payer_account_id = ${t.payerAccountId} AND x.type <> 'funding' AND x.id <> ${t.id}
          AND x.created_at < p.as_of
          AND x.created_at >= p.as_of - make_interval(mins => ${c.r4.windowMinutes})) AS velocity,
      (SELECT a.opened_at FROM accounts a WHERE a.id = ${t.payeeAccountId}) AS payee_opened_at,
      (SELECT count(*) FROM (
          SELECT x.payer_account_id FROM transactions x, p
          WHERE x.payee_account_id = ${t.payeeAccountId} AND x.status = 'settled' AND x.type <> 'funding'
            AND x.created_at < p.as_of AND x.payer_account_id <> ${t.payerAccountId}
          GROUP BY x.payer_account_id, p.as_of
          HAVING min(x.created_at) >= p.as_of - make_interval(hours => ${c.r6.windowHours})
        ) s) AS new_senders,
      (SELECT COALESCE(sum(x.amount_paise), 0) FROM transactions x, p
        WHERE x.payee_account_id = ${t.payeeAccountId} AND x.status = 'settled' AND x.type <> 'funding'
          AND x.created_at < p.as_of
          AND x.created_at >= p.as_of - make_interval(hours => ${c.r7.windowHours})) AS inflow,
      (SELECT COALESCE(sum(o.amount_paise), 0) FROM transactions o, p
        WHERE o.payer_account_id = ${t.payeeAccountId} AND o.status = 'settled' AND o.type <> 'funding'
          AND o.created_at < p.as_of
          AND o.created_at >= p.as_of - make_interval(hours => ${c.r7.windowHours})
          AND EXISTS (
            SELECT 1 FROM transactions i
            WHERE i.payee_account_id = ${t.payeeAccountId} AND i.status = 'settled' AND i.type <> 'funding'
              AND i.created_at <= o.created_at
              AND i.created_at >= o.created_at - make_interval(mins => ${c.r7.forwardWithinMinutes})
          )) AS forwarded
  `);
  const row = result.rows[0] as Record<string, string | Date | null>;
  const openedAt = row.payee_opened_at ? new Date(row.payee_opened_at) : t.createdAt;

  return {
    txnType: t.type === 'collect' ? 'collect' : 'pay',
    amountPaise: t.amountPaise,
    note: t.note,
    payerPriorPaymentsToPayee: Number(row.prior_to_payee),
    payerMedianOutgoingPaise: row.median_out === null ? null : Number(row.median_out),
    payerOutgoingHistoryCount: Number(row.history_count),
    payerOutgoingInWindow: Number(row.velocity),
    payeeAccountAgeDays: accountAgeDays(openedAt, t.createdAt),
    payeeDistinctNewSenders: Number(row.new_senders),
    payeeInflowPaise: Number(row.inflow),
    payeeForwardedPaise: Number(row.forwarded),
  };
}

export function accountAgeDays(openedAt: Date, asOf: Date): number {
  return Math.max(0, Math.floor((asOf.getTime() - openedAt.getTime()) / 86_400_000));
}
