import { sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { accountAgeDays } from '@/lib/risk/context-sql';

/**
 * Read-only queries behind the analyst dashboard and the copilot tools.
 * Nothing in this file inserts, updates or deletes.
 */

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export type TxnSummary = {
  id: string;
  type: string;
  status: string;
  amountPaise: number;
  note: string;
  createdAt: string | null;
  riskScore: number | null;
  riskDecision: string | null;
  payer: { accountId: string; name: string; vpa: string };
  payee: { accountId: string; name: string; vpa: string; ageDays: number };
  rules: string[];
  label: { isFraud: boolean; scenario: string } | null;
};

function toSummary(r: Row): TxnSummary {
  return {
    id: String(r.id),
    type: String(r.type),
    status: String(r.status),
    amountPaise: Number(r.amount_paise),
    note: String(r.note ?? ''),
    createdAt: iso(r.created_at),
    riskScore: r.risk_score === null ? null : Number(r.risk_score),
    riskDecision: (r.risk_decision as string) ?? null,
    payer: { accountId: String(r.payer_account_id), name: String(r.payer_name ?? r.payer_vpa), vpa: String(r.payer_vpa) },
    payee: {
      accountId: String(r.payee_account_id),
      name: String(r.payee_name ?? r.payee_vpa),
      vpa: String(r.payee_vpa),
      ageDays: accountAgeDays(new Date(r.payee_opened_at as string), new Date(r.created_at as string)),
    },
    rules: Array.isArray(r.fired_rules) ? (r.fired_rules as { id: string }[]).map((x) => x.id) : [],
    label: r.is_fraud === null || r.is_fraud === undefined ? null : { isFraud: Boolean(r.is_fraud), scenario: String(r.scenario) },
  };
}

const TXN_SELECT = sql`
  SELECT t.id, t.type, t.status, t.amount_paise, t.note, t.created_at, t.risk_score, t.risk_decision,
         t.payer_account_id, t.payee_account_id, t.hold_until, t.failure_reason,
         pa.vpa AS payer_vpa, pu.name AS payer_name,
         ya.vpa AS payee_vpa, yu.name AS payee_name, ya.opened_at AS payee_opened_at,
         ra.fired_rules, ra.rules_score, ra.ai_points, ra.ai_status, ra.ai_signals, ra.explanation,
         l.is_fraud, l.scenario
  FROM transactions t
  JOIN accounts pa ON pa.id = t.payer_account_id LEFT JOIN users pu ON pu.id = pa.user_id
  JOIN accounts ya ON ya.id = t.payee_account_id LEFT JOIN users yu ON yu.id = ya.user_id
  LEFT JOIN risk_assessments ra ON ra.txn_id = t.id
  LEFT JOIN txn_labels l ON l.txn_id = t.id
`;

export type FlaggedFilters = {
  decision?: 'warn' | 'hold';
  minScore?: number;
  sinceHours?: number;
  payeeAccountId?: string;
  limit?: number;
};

export async function listFlagged(db: DbOrTx, filters: FlaggedFilters = {}): Promise<TxnSummary[]> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const result = await db.execute(sql`
    ${TXN_SELECT}
    WHERE t.risk_decision IN ('warn', 'hold')
      AND (${filters.decision ?? null}::text IS NULL OR t.risk_decision = ${filters.decision ?? null})
      AND (${filters.minScore ?? null}::int IS NULL OR t.risk_score >= ${filters.minScore ?? null})
      AND (${filters.sinceHours ?? null}::int IS NULL OR t.created_at >= now() - make_interval(hours => ${filters.sinceHours ?? 0}))
      AND (${filters.payeeAccountId ?? null}::uuid IS NULL OR t.payee_account_id = ${filters.payeeAccountId ?? null})
    ORDER BY t.created_at DESC
    LIMIT ${limit}
  `);
  return (result.rows as Row[]).map(toSummary);
}

export async function getTransactionDetail(db: DbOrTx, txnId: string) {
  const result = await db.execute(sql`${TXN_SELECT} WHERE t.id = ${txnId}`);
  const r = result.rows[0] as Row | undefined;
  if (!r) return null;
  return {
    ...toSummary(r),
    holdUntil: iso(r.hold_until),
    failureReason: (r.failure_reason as string) ?? null,
    assessment: r.fired_rules
      ? {
          rulesScore: Number(r.rules_score),
          aiPoints: Number(r.ai_points),
          aiStatus: String(r.ai_status),
          aiSignals: r.ai_signals ?? null,
          firedRules: r.fired_rules as { id: string; points: number; facts: Record<string, unknown> }[],
          explanation: r.explanation as { headline: string; reasons: string[]; source: string; lang: string },
        }
      : null,
  };
}

export async function getAccountProfile(db: DbOrTx, ref: { accountId?: string; vpa?: string }) {
  const result = await db.execute(sql`
    SELECT a.id, a.vpa, a.kind, a.opened_at, a.balance_paise, u.name, u.kind AS user_kind,
      (SELECT count(*) FROM transactions t WHERE t.payee_account_id = a.id AND t.status = 'settled' AND t.type <> 'funding') AS in_count,
      (SELECT COALESCE(sum(amount_paise),0) FROM transactions t WHERE t.payee_account_id = a.id AND t.status = 'settled' AND t.type <> 'funding') AS in_total,
      (SELECT count(*) FROM transactions t WHERE t.payer_account_id = a.id AND t.status = 'settled' AND t.type <> 'funding') AS out_count,
      (SELECT COALESCE(sum(amount_paise),0) FROM transactions t WHERE t.payer_account_id = a.id AND t.status = 'settled' AND t.type <> 'funding') AS out_total,
      (SELECT count(DISTINCT payer_account_id) FROM transactions t WHERE t.payee_account_id = a.id AND t.status = 'settled' AND t.type <> 'funding' AND t.created_at >= now() - interval '24 hours') AS senders_24h,
      (SELECT COALESCE(sum(amount_paise),0) FROM transactions t WHERE t.payee_account_id = a.id AND t.status = 'settled' AND t.type <> 'funding' AND t.created_at >= now() - interval '24 hours') AS in_24h,
      (SELECT COALESCE(sum(amount_paise),0) FROM transactions t WHERE t.payer_account_id = a.id AND t.status = 'settled' AND t.type <> 'funding' AND t.created_at >= now() - interval '24 hours') AS out_24h,
      (SELECT count(*) FROM transactions t WHERE t.payee_account_id = a.id AND t.risk_decision IN ('warn','hold')) AS flagged_in,
      (SELECT count(*) FROM transactions t WHERE t.payee_account_id = a.id AND t.risk_decision = 'hold') AS held_in
    FROM accounts a LEFT JOIN users u ON u.id = a.user_id
    WHERE (${ref.accountId ?? null}::uuid IS NOT NULL AND a.id = ${ref.accountId ?? null})
       OR (${ref.vpa ?? null}::text IS NOT NULL AND a.vpa = ${ref.vpa ?? null})
    LIMIT 1
  `);
  const r = result.rows[0] as Row | undefined;
  if (!r) return null;
  return {
    accountId: String(r.id),
    vpa: String(r.vpa),
    name: String(r.name ?? r.vpa),
    kind: String(r.user_kind ?? r.kind),
    openedAt: iso(r.opened_at),
    ageDays: accountAgeDays(new Date(r.opened_at as string), new Date()),
    received: { count: Number(r.in_count), totalPaise: Number(r.in_total) },
    sent: { count: Number(r.out_count), totalPaise: Number(r.out_total) },
    last24h: {
      distinctSenders: Number(r.senders_24h),
      receivedPaise: Number(r.in_24h),
      sentPaise: Number(r.out_24h),
    },
    flaggedIncoming: Number(r.flagged_in),
    heldIncoming: Number(r.held_in),
  };
}

export type NetworkNode = {
  id: string;
  name: string;
  vpa: string;
  ageDays: number;
  role: 'centre' | 'sender' | 'receiver' | 'both';
  receivedPaise: number;
  sentPaise: number;
  hop: number;
};
export type NetworkEdge = { source: string; target: string; amountPaise: number; count: number };

/**
 * Money flow around one account over the last `days` days: who paid it
 * (fan-in) and where it sent money (fan-out), expanded up to `hops` steps.
 * Expansion only follows accounts that are days old, so the graph follows the
 * suspected ring instead of exploding into every ordinary shop and friend.
 */
export async function getPayeeNetwork(
  db: DbOrTx,
  accountId: string,
  hops = 2,
  days = 7,
): Promise<{ nodes: NetworkNode[]; edges: NetworkEdge[]; truncated: boolean }> {
  const maxHops = Math.min(Math.max(hops, 1), 3);
  const MAX_NODES = 120;
  const seen = new Set<string>([accountId]);
  const hopOf = new Map<string, number>([[accountId, 0]]);
  const edges = new Map<string, NetworkEdge>();
  let frontier = [accountId];
  let truncated = false;

  for (let hop = 1; hop <= maxHops && frontier.length > 0; hop++) {
    const result = await db.execute(sql`
      SELECT t.payer_account_id AS source, t.payee_account_id AS target,
             sum(t.amount_paise) AS amount, count(*) AS n
      FROM transactions t
      WHERE t.status = 'settled' AND t.type <> 'funding'
        AND t.created_at >= now() - make_interval(days => ${days})
        AND (t.payer_account_id IN (${sql.join(frontier.map((id) => sql`${id}::uuid`), sql`, `)})
          OR t.payee_account_id IN (${sql.join(frontier.map((id) => sql`${id}::uuid`), sql`, `)}))
      GROUP BY 1, 2
    `);
    const next = new Set<string>();
    for (const r of result.rows as Row[]) {
      const source = String(r.source);
      const target = String(r.target);
      for (const id of [source, target]) {
        if (!seen.has(id)) {
          if (seen.size >= MAX_NODES) {
            truncated = true;
            continue;
          }
          seen.add(id);
          hopOf.set(id, hop);
          next.add(id);
        }
      }
      if (seen.has(source) && seen.has(target)) {
        edges.set(`${source}>${target}`, { source, target, amountPaise: Number(r.amount), count: Number(r.n) });
      }
    }
    if (next.size === 0) break;
    const young = await db.execute(sql`
      SELECT id FROM accounts
      WHERE id IN (${sql.join([...next].map((id) => sql`${id}::uuid`), sql`, `)})
        AND opened_at >= now() - interval '21 days'
    `);
    frontier = (young.rows as Row[]).map((r) => String(r.id));
  }

  const ids = [...seen];
  const info = await db.execute(sql`
    SELECT a.id, a.vpa, a.opened_at, u.name FROM accounts a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
  `);
  const received = new Map<string, number>();
  const sent = new Map<string, number>();
  for (const e of edges.values()) {
    received.set(e.target, (received.get(e.target) ?? 0) + e.amountPaise);
    sent.set(e.source, (sent.get(e.source) ?? 0) + e.amountPaise);
  }
  const nodes = (info.rows as Row[]).map((r): NetworkNode => {
    const id = String(r.id);
    const inn = received.get(id) ?? 0;
    const out = sent.get(id) ?? 0;
    return {
      id,
      name: String(r.name ?? r.vpa),
      vpa: String(r.vpa),
      ageDays: accountAgeDays(new Date(r.opened_at as string), new Date()),
      role: id === accountId ? 'centre' : inn > 0 && out > 0 ? 'both' : out > 0 ? 'sender' : 'receiver',
      receivedPaise: inn,
      sentPaise: out,
      hop: hopOf.get(id) ?? 0,
    };
  });
  return { nodes, edges: [...edges.values()], truncated };
}

/** Accounts ranked by how much flagged money was sent to them recently. */
export async function listSuspiciousPayees(db: DbOrTx, limit = 12) {
  const result = await db.execute(sql`
    SELECT a.id, a.vpa, a.opened_at, u.name,
           count(*) FILTER (WHERE t.risk_decision = 'hold') AS held,
           count(*) AS flagged,
           count(DISTINCT t.payer_account_id) AS senders,
           sum(t.amount_paise) AS amount
    FROM transactions t
    JOIN accounts a ON a.id = t.payee_account_id LEFT JOIN users u ON u.id = a.user_id
    WHERE t.risk_decision IN ('warn','hold') AND t.created_at >= now() - interval '14 days'
    GROUP BY a.id, a.vpa, a.opened_at, u.name
    ORDER BY held DESC, flagged DESC
    LIMIT ${limit}
  `);
  return (result.rows as Row[]).map((r) => ({
    accountId: String(r.id),
    vpa: String(r.vpa),
    name: String(r.name ?? r.vpa),
    ageDays: accountAgeDays(new Date(r.opened_at as string), new Date()),
    held: Number(r.held),
    flagged: Number(r.flagged),
    senders: Number(r.senders),
    amountPaise: Number(r.amount),
  }));
}

export async function dashboardStats(db: DbOrTx) {
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM transactions WHERE risk_decision IS NOT NULL) AS total,
      (SELECT count(*) FROM transactions WHERE risk_decision = 'warn') AS warned,
      (SELECT count(*) FROM transactions WHERE risk_decision = 'hold') AS held,
      (SELECT COALESCE(sum(amount_paise),0) FROM transactions WHERE status IN ('held','failed') AND risk_decision = 'hold') AS stopped_paise,
      (SELECT count(*) FROM transactions WHERE status = 'held') AS on_hold_now,
      (SELECT count(*) FROM audit_log) AS audit_rows
  `);
  const r = result.rows[0] as Row;
  const hours = await db.execute(sql`
    SELECT to_char(date_trunc('hour', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24') AS hour, count(*) AS total,
      count(*) FILTER (WHERE risk_decision = 'allow') AS allowed,
      count(*) FILTER (WHERE risk_decision = 'warn') AS warned,
      count(*) FILTER (WHERE risk_decision = 'hold') AS held
    FROM transactions
    WHERE risk_decision IS NOT NULL
      AND created_at >= (date_trunc('hour', now() AT TIME ZONE 'UTC') - interval '11 hours') AT TIME ZONE 'UTC'
    GROUP BY 1 ORDER BY 1
  `);
  const byHour = new Map((hours.rows as Row[]).map((row) => [
    String(row.hour),
    { total: Number(row.total), allowed: Number(row.allowed), warned: Number(row.warned), held: Number(row.held) },
  ]));
  const now = new Date();
  const volumeHours = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(now);
    date.setMinutes(0, 0, 0);
    date.setHours(date.getHours() - (11 - i));
    const key = date.toISOString().slice(0, 13);
    return { hour: date.toISOString(), ...byHour.get(key) ?? { total: 0, allowed: 0, warned: 0, held: 0 } };
  });
  return {
    transactions: Number(r.total),
    warned: Number(r.warned),
    held: Number(r.held),
    stoppedPaise: Number(r.stopped_paise),
    onHoldNow: Number(r.on_hold_now),
    auditRows: Number(r.audit_rows),
    volumeHours,
  };
}
