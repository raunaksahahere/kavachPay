import type { Decision, RuleId } from '@/config/risk';

/**
 * Everything the rules need to know about one payment, as plain numbers.
 * Built from the database (live) or from an in-memory history (batch eval);
 * the rules themselves never touch the database.
 */
export type RiskFacts = {
  txnType: 'pay' | 'collect';
  amountPaise: number;
  note: string;
  /** Settled payments from this payer to this payee before now. */
  payerPriorPaymentsToPayee: number;
  /** Median of the payer's settled outgoing payments in the R3 window; null if none. */
  payerMedianOutgoingPaise: number | null;
  payerOutgoingHistoryCount: number;
  /** Other payments started by the payer inside the R4 window. */
  payerOutgoingInWindow: number;
  payeeAccountAgeDays: number;
  /** Distinct other senders who paid this payee for the first time inside the R6 window. */
  payeeDistinctNewSenders: number;
  /** Money the payee received inside the R7 window. */
  payeeInflowPaise: number;
  /** Money the payee sent on shortly after receiving it, inside the R7 window. */
  payeeForwardedPaise: number;
};

export type FiredRule = {
  id: RuleId;
  points: number;
  /** The exact numbers that made the rule fire. Explanations may only use these. */
  facts: Record<string, string | number | boolean>;
};

export type RulesOutcome = {
  fired: FiredRule[];
  /** Sum of points from R1..R7, clamped to 0..100. */
  rulesScore: number;
};

export type Explanation = {
  lang: 'en' | 'hi' | 'bn';
  headline: string;
  reasons: string[];
  /** 'ai' only when Gemini's wording passed the grounding check. */
  source: 'template' | 'ai';
  cached?: boolean;
};

export type AiStatus =
  | 'not_run'
  | 'disabled'
  | 'ok'
  | 'cached'
  | 'timeout'
  | 'error'
  | 'invalid'
  | 'blocked';

export type Assessment = {
  score: number;
  rulesScore: number;
  aiPoints: number;
  decision: Decision;
  fired: FiredRule[];
  aiStatus: AiStatus;
  aiSignals: unknown | null;
  explanation: Explanation;
};
