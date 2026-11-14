import type { Lang } from '@/config/app';
import { decisionForScore } from '@/config/risk';
import type { DbOrTx } from '@/db/client';
import type { AiPort, AnalyzeInput } from '@/lib/ai/port';
import type { ScamSignals } from '@/lib/ai/schema';
import { buildFactsFromDb, type TxnForRisk } from './context-sql';
import { isGrounded, templateExplanation } from './explain';
import { r8FromSignals } from './r8';
import { clampScore, evaluateRules } from './rules';
import type { AiStatus, Assessment, Explanation, FiredRule, RiskFacts } from './types';

export type Scored = {
  fired: FiredRule[];
  rulesScore: number;
  aiPoints: number;
  score: number;
  decision: Assessment['decision'];
};

/**
 * The whole scoring decision, as a pure function. Rules R1..R7 come from facts;
 * R8 comes from already-validated AI signals. The final score is
 * rulesScore + aiPoints with aiPoints >= 0, so AI can never lower it.
 */
export function scoreFromFacts(facts: RiskFacts, signals: ScamSignals | null): Scored {
  const { fired, rulesScore } = evaluateRules(facts);
  const r8 = r8FromSignals(signals);
  const aiPoints = r8?.points ?? 0;
  const score = clampScore(rulesScore + aiPoints);
  return {
    fired: r8 ? [...fired, r8] : fired,
    rulesScore,
    aiPoints,
    score: Math.max(score, rulesScore),
    decision: decisionForScore(Math.max(score, rulesScore)),
  };
}

/** Accepts AI wording only if it is grounded and covers the same number of reasons. */
export function chooseExplanation(
  template: Explanation,
  candidate: { headline: string; reasons: string[] } | null,
  cached: boolean,
): Explanation {
  if (!candidate) return template;
  if (candidate.reasons.length !== template.reasons.length) return template;
  if (!isGrounded(candidate, template)) return template;
  return { lang: template.lang, headline: candidate.headline, reasons: candidate.reasons, source: 'ai', cached };
}

export type AssessOptions = {
  lang: Lang;
  payeeName: string;
  /** null runs the engine on rules only. */
  ai: AiPort | null;
  /** Extra message or screenshot the user attached. Defaults to the note. */
  message?: AnalyzeInput;
};

/** Scores one payment: facts from the database, optional AI signals, then the explanation. */
export async function assessTransaction(
  db: DbOrTx,
  txn: TxnForRisk,
  opts: AssessOptions,
): Promise<Assessment> {
  const facts = await buildFactsFromDb(db, txn);

  let aiStatus: AiStatus = opts.ai ? 'not_run' : 'disabled';
  let signals: ScamSignals | null = null;
  const message: AnalyzeInput | null =
    opts.message ?? (txn.note.trim() ? { text: txn.note } : null);

  if (opts.ai && message) {
    try {
      const outcome = await opts.ai.analyze(message);
      aiStatus = outcome.status;
      signals = outcome.signals;
    } catch {
      aiStatus = 'error';
    }
  }

  const scored = scoreFromFacts(facts, signals);
  const template = templateExplanation(scored.fired, opts.lang, {
    txnType: facts.txnType,
    amountPaise: txn.amountPaise,
    payeeName: opts.payeeName,
  });

  let explanation = template;
  if (opts.ai && scored.decision !== 'allow' && scored.fired.length > 0) {
    try {
      const outcome = await opts.ai.explain({
        lang: opts.lang,
        decision: scored.decision,
        txnType: facts.txnType,
        fired: scored.fired,
        template,
      });
      explanation = chooseExplanation(template, outcome.candidate, outcome.status === 'cached');
    } catch {
      explanation = template;
    }
  }

  return {
    score: scored.score,
    rulesScore: scored.rulesScore,
    aiPoints: scored.aiPoints,
    decision: scored.decision,
    fired: scored.fired,
    aiStatus,
    aiSignals: signals,
    explanation,
  };
}
