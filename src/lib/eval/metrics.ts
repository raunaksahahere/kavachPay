import { RISK_CONFIG, type RuleId } from '@/config/risk';
import type { Db } from '@/db/client';
import { accounts, transactions, txnLabels } from '@/db/schema';
import type { ScamSignals } from '@/lib/ai/schema';
import { scoreFromFacts, type Scored } from '@/lib/risk/assess';
import { HistoryIndex, type HistoryTxn } from '@/lib/risk/context-memory';

export type LabelledTxn = HistoryTxn & { isFraud: boolean; scenario: string };

export type ScenarioRow = {
  scenario: string;
  isFraud: boolean;
  total: number;
  /** warn or hold */
  flagged: number;
  held: number;
};

export type DetectionMetrics = {
  transactions: number;
  fraud: number;
  legit: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  precision: number | null;
  recall: number | null;
  falsePositiveRate: number | null;
  /** Share of fraud that was blocked outright (hold). */
  holdRecall: number | null;
  /** Share of legitimate payments blocked outright (hold). */
  holdFalsePositiveRate: number | null;
  scenarios: ScenarioRow[];
  ruleFires: Record<string, { fraud: number; legit: number }>;
};

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

/** Loads every labelled historical payment plus an index of the full history. */
export async function loadLabelledHistory(db: Db): Promise<{ labelled: LabelledTxn[]; index: HistoryIndex }> {
  const all = await db.select().from(transactions);
  const labels = await db.select().from(txnLabels);
  const accountRows = await db.select({ id: accounts.id, openedAt: accounts.openedAt }).from(accounts);
  const labelById = new Map(labels.map((l) => [l.txnId, l]));
  const index = new HistoryIndex(all as HistoryTxn[], new Map(accountRows.map((a) => [a.id, a.openedAt])));
  const labelled = (all as HistoryTxn[])
    .filter((t) => labelById.has(t.id))
    .map((t) => ({ ...t, isFraud: labelById.get(t.id)!.isFraud, scenario: labelById.get(t.id)!.scenario }));
  return { labelled, index };
}

/**
 * Scores every labelled payment as of its own timestamp and compares the
 * decision with the label. "Flagged" means warn or hold. Pass AI signals per
 * note to measure the engine with R8; omit them for rules only.
 */
export function evaluateDetection(
  labelled: LabelledTxn[],
  index: HistoryIndex,
  signalsByNote?: Map<string, ScamSignals>,
): { metrics: DetectionMetrics; scored: Map<string, Scored> } {
  const scenarios = new Map<string, ScenarioRow>();
  const ruleFires: DetectionMetrics['ruleFires'] = {};
  const scored = new Map<string, Scored>();
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let heldFraud = 0;
  let heldLegit = 0;

  for (const t of labelled) {
    const signals = signalsByNote && t.note.trim() ? (signalsByNote.get(t.note) ?? null) : null;
    const s = scoreFromFacts(index.factsFor(t), signals);
    scored.set(t.id, s);
    const flagged = s.decision !== 'allow';
    const held = s.decision === 'hold';

    const row = scenarios.get(t.scenario) ?? { scenario: t.scenario, isFraud: t.isFraud, total: 0, flagged: 0, held: 0 };
    row.total++;
    if (flagged) row.flagged++;
    if (held) row.held++;
    scenarios.set(t.scenario, row);

    if (t.isFraud) {
      if (flagged) tp++;
      else fn++;
      if (held) heldFraud++;
    } else {
      if (flagged) fp++;
      else tn++;
      if (held) heldLegit++;
    }
    for (const rule of s.fired) {
      const entry = (ruleFires[rule.id] ??= { fraud: 0, legit: 0 });
      if (t.isFraud) entry.fraud++;
      else entry.legit++;
    }
  }

  const fraud = tp + fn;
  const legit = fp + tn;
  return {
    scored,
    metrics: {
      transactions: labelled.length,
      fraud,
      legit,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      trueNegatives: tn,
      precision: ratio(tp, tp + fp),
      recall: ratio(tp, fraud),
      falsePositiveRate: ratio(fp, legit),
      holdRecall: ratio(heldFraud, fraud),
      holdFalsePositiveRate: ratio(heldLegit, legit),
      scenarios: [...scenarios.values()].sort(
        (a, b) => Number(b.isFraud) - Number(a.isFraud) || a.scenario.localeCompare(b.scenario),
      ),
      ruleFires,
    },
  };
}

export function configSnapshot() {
  return {
    thresholds: RISK_CONFIG.thresholds,
    weights: RISK_CONFIG.weights as Record<Exclude<RuleId, 'R8_AI_SIGNALS'>, number>,
  };
}

export const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

