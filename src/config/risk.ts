/**
 * Every risk threshold and weight lives here. Nothing else in the codebase
 * hardcodes a number that changes a risk decision.
 *
 * Money is always in paise (1 rupee = 100 paise).
 */

export const RISK_CONFIG = {
  /** Score bands. Score is clamped to 0..100. */
  thresholds: {
    /** score >= warn  -> user must actively confirm */
    warn: 30,
    /** score >= hold  -> payment is blocked for the cooling period */
    hold: 70,
  },

  /** Minutes a held payment stays blocked before the payer may release it. */
  coolingPeriodMinutes: 30,

  /** Points added when a rule fires. Tuned on the synthetic eval set. */
  weights: {
    R1_DIRECTION_MISMATCH: 40,
    R2_NEW_PAYEE: 10,
    R3_AMOUNT_ANOMALY: 20,
    R4_VELOCITY: 35,
    R5_YOUNG_PAYEE: 20,
    R6_MULE_FAN_IN: 40,
    R7_PASS_THROUGH: 25,
  },

  /** R1: words in a collect note that imply the payer will RECEIVE money. */
  r1: {
    receiveKeywords: [
      'refund',
      'cashback',
      'cash back',
      'prize',
      'reward',
      'lottery',
      'winning',
      'won',
      'kyc',
      'reversal',
      'claim',
      'credit to your account',
      'receive',
      'रिफंड',
      'कैशबैक',
      'इनाम',
      'রিফান্ড',
      'ক্যাশব্যাক',
      'পুরস্কার',
    ],
  },

  /** R3: amount > multiplier x the payer's median outgoing amount over the window. */
  r3: {
    windowDays: 90,
    multiplier: 5,
    /** Not enough history below this many payments: the rule stays silent. */
    minHistory: 5,
    /** Ignore anomalies on small amounts (paise). */
    minAmountPaise: 2_000_00,
  },

  /** R4: more than maxOutgoing payments started by the payer inside the window. */
  r4: {
    windowMinutes: 10,
    maxOutgoing: 4,
  },

  /** R5: payee account opened fewer than this many days ago. */
  r5: {
    maxAgeDays: 7,
  },

  /** R6: payee received money from at least this many first-time senders. */
  r6: {
    windowHours: 24,
    minDistinctNewSenders: 5,
  },

  /** R7: payee forwarded at least this share of recent inflow shortly after receiving it. */
  r7: {
    windowHours: 24,
    /** An outgoing payment counts as pass-through if it follows an inflow within this gap. */
    forwardWithinMinutes: 30,
    minForwardRatio: 0.7,
    /** Ignore accounts with little inflow (paise). */
    minInflowPaise: 5_000_00,
  },
} as const;

export type RuleId = keyof typeof RISK_CONFIG.weights | 'R8_AI_SIGNALS';

export type Decision = 'allow' | 'warn' | 'hold';

export function decisionForScore(score: number): Decision {
  if (score >= RISK_CONFIG.thresholds.hold) return 'hold';
  if (score >= RISK_CONFIG.thresholds.warn) return 'warn';
  return 'allow';
}
