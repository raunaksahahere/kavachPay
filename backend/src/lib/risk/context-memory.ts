import { RISK_CONFIG } from '@/config/risk';
import { accountAgeDays, type TxnForRisk } from './context-sql';
import type { RiskFacts } from './types';

export type HistoryTxn = TxnForRisk & { status: string };

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Same definition as SQL percentile_cont(0.5): the mean of the two middle values when even. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * In-memory twin of buildFactsFromDb, for scoring thousands of historical
 * payments without thousands of queries. A parity test keeps the two in step.
 */
export class HistoryIndex {
  private byPayer = new Map<string, HistoryTxn[]>();
  private byPayee = new Map<string, HistoryTxn[]>();

  constructor(
    txns: HistoryTxn[],
    private openedAt: Map<string, Date>,
  ) {
    const sorted = txns
      .filter((t) => t.type !== 'funding')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (const t of sorted) {
      push(this.byPayer, t.payerAccountId, t);
      push(this.byPayee, t.payeeAccountId, t);
    }
  }

  factsFor(t: TxnForRisk): RiskFacts {
    const c = RISK_CONFIG;
    const asOf = t.createdAt.getTime();
    const settledBefore = (x: HistoryTxn) => x.status === 'settled' && x.createdAt.getTime() < asOf;
    const outgoing = (this.byPayer.get(t.payerAccountId) ?? []).filter(settledBefore);
    const incoming = (this.byPayee.get(t.payeeAccountId) ?? []).filter(settledBefore);

    const recentOut = outgoing.filter((x) => x.createdAt.getTime() >= asOf - c.r3.windowDays * DAY);

    const velocity = (this.byPayer.get(t.payerAccountId) ?? []).filter(
      (x) =>
        x.id !== t.id &&
        x.createdAt.getTime() < asOf &&
        x.createdAt.getTime() >= asOf - c.r4.windowMinutes * MIN,
    ).length;

    const firstSeen = new Map<string, number>();
    for (const x of incoming) {
      if (x.payerAccountId === t.payerAccountId) continue;
      if (!firstSeen.has(x.payerAccountId)) firstSeen.set(x.payerAccountId, x.createdAt.getTime());
    }
    const newSenders = [...firstSeen.values()].filter((ts) => ts >= asOf - c.r6.windowHours * HOUR).length;

    const windowStart = asOf - c.r7.windowHours * HOUR;
    const inflowTxns = incoming.filter((x) => x.createdAt.getTime() >= windowStart);
    const inflow = inflowTxns.reduce((s, x) => s + x.amountPaise, 0);
    const allIncomingSettled = (this.byPayee.get(t.payeeAccountId) ?? []).filter((x) => x.status === 'settled');
    const payeeOut = (this.byPayer.get(t.payeeAccountId) ?? []).filter(
      (x) => settledBefore(x) && x.createdAt.getTime() >= windowStart,
    );
    const forwarded = payeeOut
      .filter((o) =>
        allIncomingSettled.some(
          (i) =>
            i.createdAt.getTime() <= o.createdAt.getTime() &&
            i.createdAt.getTime() >= o.createdAt.getTime() - c.r7.forwardWithinMinutes * MIN,
        ),
      )
      .reduce((s, x) => s + x.amountPaise, 0);

    return {
      txnType: t.type === 'collect' ? 'collect' : 'pay',
      amountPaise: t.amountPaise,
      note: t.note,
      payerPriorPaymentsToPayee: outgoing.filter((x) => x.payeeAccountId === t.payeeAccountId).length,
      payerMedianOutgoingPaise: median(recentOut.map((x) => x.amountPaise)),
      payerOutgoingHistoryCount: recentOut.length,
      payerOutgoingInWindow: velocity,
      payeeAccountAgeDays: accountAgeDays(this.openedAt.get(t.payeeAccountId) ?? t.createdAt, t.createdAt),
      payeeDistinctNewSenders: newSenders,
      payeeInflowPaise: inflow,
      payeeForwardedPaise: forwarded,
    };
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
