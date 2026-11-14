import { RISK_CONFIG } from '@/config/risk';
import type { FiredRule, RiskFacts, RulesOutcome } from './types';

const W = RISK_CONFIG.weights;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** First configured keyword found in the note, or null. Latin keywords match whole words only. */
export function findReceiveKeyword(note: string): string | null {
  const text = note.toLowerCase();
  for (const keyword of RISK_CONFIG.r1.receiveKeywords) {
    const isLatin = /^[\x00-\x7f]+$/.test(keyword);
    const hit = isLatin
      ? new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}([^a-z0-9]|$)`).test(text)
      : text.includes(keyword);
    if (hit) return keyword;
  }
  return null;
}

/** R1: a collect request whose note implies the payer will receive money. */
export function r1DirectionMismatch(f: RiskFacts): FiredRule | null {
  if (f.txnType !== 'collect') return null;
  const keyword = findReceiveKeyword(f.note);
  if (!keyword) return null;
  return { id: 'R1_DIRECTION_MISMATCH', points: W.R1_DIRECTION_MISMATCH, facts: { keyword } };
}

/** R2: first-ever payment to this payee. */
export function r2NewPayee(f: RiskFacts): FiredRule | null {
  if (f.payerPriorPaymentsToPayee > 0) return null;
  return { id: 'R2_NEW_PAYEE', points: W.R2_NEW_PAYEE, facts: {} };
}

/** R3: amount far above the payer's own median. */
export function r3AmountAnomaly(f: RiskFacts): FiredRule | null {
  const c = RISK_CONFIG.r3;
  if (f.payerMedianOutgoingPaise === null || f.payerMedianOutgoingPaise <= 0) return null;
  if (f.payerOutgoingHistoryCount < c.minHistory) return null;
  if (f.amountPaise < c.minAmountPaise) return null;
  if (f.amountPaise <= c.multiplier * f.payerMedianOutgoingPaise) return null;
  return {
    id: 'R3_AMOUNT_ANOMALY',
    points: W.R3_AMOUNT_ANOMALY,
    facts: {
      amountPaise: f.amountPaise,
      medianPaise: f.payerMedianOutgoingPaise,
      multiple: Math.round((f.amountPaise / f.payerMedianOutgoingPaise) * 10) / 10,
    },
  };
}

/** R4: too many payments started by the payer in a short window. */
export function r4Velocity(f: RiskFacts): FiredRule | null {
  const c = RISK_CONFIG.r4;
  // The current payment counts too.
  const count = f.payerOutgoingInWindow + 1;
  if (count <= c.maxOutgoing) return null;
  return {
    id: 'R4_VELOCITY',
    points: W.R4_VELOCITY,
    facts: { count, windowMinutes: c.windowMinutes },
  };
}

/** R5: payee account is very new. */
export function r5YoungPayee(f: RiskFacts): FiredRule | null {
  if (f.payeeAccountAgeDays >= RISK_CONFIG.r5.maxAgeDays) return null;
  return { id: 'R5_YOUNG_PAYEE', points: W.R5_YOUNG_PAYEE, facts: { ageDays: f.payeeAccountAgeDays } };
}

/** R6: payee is collecting money from many first-time senders. */
export function r6MuleFanIn(f: RiskFacts): FiredRule | null {
  const c = RISK_CONFIG.r6;
  if (f.payeeDistinctNewSenders < c.minDistinctNewSenders) return null;
  return {
    id: 'R6_MULE_FAN_IN',
    points: W.R6_MULE_FAN_IN,
    facts: { senders: f.payeeDistinctNewSenders, windowHours: c.windowHours },
  };
}

/** R7: payee forwards most of what it receives within minutes. */
export function r7PassThrough(f: RiskFacts): FiredRule | null {
  const c = RISK_CONFIG.r7;
  if (f.payeeInflowPaise < c.minInflowPaise) return null;
  const ratio = f.payeeForwardedPaise / f.payeeInflowPaise;
  if (ratio < c.minForwardRatio) return null;
  return {
    id: 'R7_PASS_THROUGH',
    points: W.R7_PASS_THROUGH,
    facts: {
      forwardedPercent: Math.min(100, Math.round(ratio * 100)),
      windowMinutes: c.forwardWithinMinutes,
    },
  };
}

export const RULES = [
  r1DirectionMismatch,
  r2NewPayee,
  r3AmountAnomaly,
  r4Velocity,
  r5YoungPayee,
  r6MuleFanIn,
  r7PassThrough,
] as const;

export const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Runs R1..R7. Pure: same facts in, same outcome out. */
export function evaluateRules(facts: RiskFacts): RulesOutcome {
  const fired = RULES.map((rule) => rule(facts)).filter((r): r is FiredRule => r !== null);
  return { fired, rulesScore: clampScore(fired.reduce((sum, r) => sum + r.points, 0)) };
}
