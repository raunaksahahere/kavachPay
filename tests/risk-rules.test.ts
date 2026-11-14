import { describe, expect, it } from 'vitest';
import { AI_CONFIG } from '../src/config/ai';
import { decisionForScore, RISK_CONFIG } from '../src/config/risk';
import type { ScamSignals } from '../src/lib/ai/schema';
import { chooseExplanation, scoreFromFacts } from '../src/lib/risk/assess';
import { extractNumbers, isGrounded, templateExplanation } from '../src/lib/risk/explain';
import { r8FromSignals } from '../src/lib/risk/r8';
import {
  evaluateRules,
  findReceiveKeyword,
  r1DirectionMismatch,
  r2NewPayee,
  r3AmountAnomaly,
  r4Velocity,
  r5YoungPayee,
  r6MuleFanIn,
  r7PassThrough,
} from '../src/lib/risk/rules';
import type { RiskFacts } from '../src/lib/risk/types';

const W = RISK_CONFIG.weights;

/** An ordinary payment to a long-known payee: nothing should fire. */
const safe: RiskFacts = {
  txnType: 'pay',
  amountPaise: 500_00,
  note: 'dinner',
  payerPriorPaymentsToPayee: 6,
  payerMedianOutgoingPaise: 400_00,
  payerOutgoingHistoryCount: 40,
  payerOutgoingInWindow: 0,
  payeeAccountAgeDays: 800,
  payeeDistinctNewSenders: 0,
  payeeInflowPaise: 0,
  payeeForwardedPaise: 0,
};
const facts = (over: Partial<RiskFacts>): RiskFacts => ({ ...safe, ...over });

const signals = (over: Partial<ScamSignals> = {}): ScamSignals => ({
  scam_type: 'none',
  claimed_purpose: '',
  money_direction_claimed: 'unclear',
  urgency_cues: [],
  impersonated_entity: null,
  asks_for_pin_or_otp: false,
  extracted_vpa: null,
  extracted_amount: null,
  confidence: 0.9,
  ...over,
});

describe('baseline', () => {
  it('fires nothing for an ordinary payment', () => {
    expect(evaluateRules(safe)).toEqual({ fired: [], rulesScore: 0 });
    expect(scoreFromFacts(safe, null).decision).toBe('allow');
  });

  it('maps scores to decisions at the configured thresholds', () => {
    expect(decisionForScore(29)).toBe('allow');
    expect(decisionForScore(30)).toBe('warn');
    expect(decisionForScore(69)).toBe('warn');
    expect(decisionForScore(70)).toBe('hold');
  });
});

describe('R1 direction mismatch', () => {
  it('fires on a collect request that talks about receiving money', () => {
    const fired = r1DirectionMismatch(facts({ txnType: 'collect', note: 'Refund for order #4471' }));
    expect(fired).toMatchObject({ id: 'R1_DIRECTION_MISMATCH', points: W.R1_DIRECTION_MISMATCH });
    expect(fired?.facts.keyword).toBe('refund');
  });
  it('matches Hindi and Bengali keywords', () => {
    expect(findReceiveKeyword('आपका रिफंड तैयार है')).toBe('रिफंड');
    expect(findReceiveKeyword('আপনার ক্যাশব্যাক')).toBe('ক্যাশব্যাক');
  });
  it('does not fire on a push payment, or on an ordinary collect note', () => {
    expect(r1DirectionMismatch(facts({ txnType: 'pay', note: 'refund for dinner' }))).toBeNull();
    expect(r1DirectionMismatch(facts({ txnType: 'collect', note: 'Order #2207 payment' }))).toBeNull();
  });
  it('matches whole words only', () => {
    expect(findReceiveKeyword('wonderful evening')).toBeNull();
    expect(findReceiveKeyword('refundable deposit')).toBeNull();
    expect(findReceiveKeyword('You WON a prize')).toBe('prize');
  });
});

describe('R2 new payee', () => {
  it('fires only on the first payment to a payee', () => {
    expect(r2NewPayee(facts({ payerPriorPaymentsToPayee: 0 }))?.points).toBe(W.R2_NEW_PAYEE);
    expect(r2NewPayee(facts({ payerPriorPaymentsToPayee: 1 }))).toBeNull();
  });
});

describe('R3 amount anomaly', () => {
  const big = RISK_CONFIG.r3.multiplier * 400_00 + 100;
  it('fires when the amount is far above the payer median', () => {
    const fired = r3AmountAnomaly(facts({ amountPaise: 20_000_00 }));
    expect(fired?.facts).toEqual({ amountPaise: 20_000_00, medianPaise: 400_00, multiple: 50 });
  });
  it('is silent at or below the multiplier', () => {
    expect(r3AmountAnomaly(facts({ amountPaise: RISK_CONFIG.r3.multiplier * 400_00 }))).toBeNull();
  });
  it('is silent without enough history, or for small amounts', () => {
    expect(r3AmountAnomaly(facts({ amountPaise: big, payerOutgoingHistoryCount: 2 }))).toBeNull();
    expect(r3AmountAnomaly(facts({ amountPaise: big, payerMedianOutgoingPaise: null }))).toBeNull();
    expect(
      r3AmountAnomaly(facts({ amountPaise: 1_500_00, payerMedianOutgoingPaise: 100_00 })),
    ).toBeNull();
  });
});

describe('R4 velocity', () => {
  it('fires when the payment pushes the payer over the limit', () => {
    const max = RISK_CONFIG.r4.maxOutgoing;
    expect(r4Velocity(facts({ payerOutgoingInWindow: max - 1 }))).toBeNull();
    expect(r4Velocity(facts({ payerOutgoingInWindow: max }))?.facts).toEqual({
      count: max + 1,
      windowMinutes: RISK_CONFIG.r4.windowMinutes,
    });
  });
});

describe('R5 young payee', () => {
  it('fires for accounts younger than the limit', () => {
    expect(r5YoungPayee(facts({ payeeAccountAgeDays: 2 }))?.facts).toEqual({ ageDays: 2 });
    expect(r5YoungPayee(facts({ payeeAccountAgeDays: RISK_CONFIG.r5.maxAgeDays }))).toBeNull();
  });
});

describe('R6 mule fan-in', () => {
  it('fires at the configured number of first-time senders', () => {
    const min = RISK_CONFIG.r6.minDistinctNewSenders;
    expect(r6MuleFanIn(facts({ payeeDistinctNewSenders: min - 1 }))).toBeNull();
    expect(r6MuleFanIn(facts({ payeeDistinctNewSenders: 37 }))?.facts).toEqual({
      senders: 37,
      windowHours: RISK_CONFIG.r6.windowHours,
    });
  });
});

describe('R7 pass-through', () => {
  it('fires when most of the inflow is forwarded quickly', () => {
    const fired = r7PassThrough(facts({ payeeInflowPaise: 100_000_00, payeeForwardedPaise: 92_000_00 }));
    expect(fired?.facts.forwardedPercent).toBe(92);
  });
  it('is silent for low ratios and for small inflows', () => {
    expect(r7PassThrough(facts({ payeeInflowPaise: 100_000_00, payeeForwardedPaise: 30_000_00 }))).toBeNull();
    expect(r7PassThrough(facts({ payeeInflowPaise: 1_000_00, payeeForwardedPaise: 1_000_00 }))).toBeNull();
  });
});

describe('combined scenarios', () => {
  it('holds a refund collect request from a young mule account', () => {
    const scored = scoreFromFacts(
      facts({
        txnType: 'collect',
        note: 'Refund for your cancelled order',
        amountPaise: 4_999_00,
        payerPriorPaymentsToPayee: 0,
        payeeAccountAgeDays: 2,
        payeeDistinctNewSenders: 37,
      }),
      null,
    );
    expect(scored.decision).toBe('hold');
    expect(scored.fired.map((r) => r.id)).toEqual([
      'R1_DIRECTION_MISMATCH',
      'R2_NEW_PAYEE',
      'R3_AMOUNT_ANOMALY',
      'R5_YOUNG_PAYEE',
      'R6_MULE_FAN_IN',
    ]);
    expect(scored.score).toBe(100);
  });

  it('does not hold a large rent payment to a known landlord', () => {
    const scored = scoreFromFacts(
      facts({ amountPaise: 18_000_00, payerPriorPaymentsToPayee: 3, payeeAccountAgeDays: 900 }),
      null,
    );
    expect(scored.decision).not.toBe('hold');
  });
});

describe('R8 AI signals stay inside the decision boundary', () => {
  it('adds points from a fixed table and never more than the cap', () => {
    const everything = signals({
      scam_type: 'otp_phishing',
      money_direction_claimed: 'receive',
      asks_for_pin_or_otp: true,
      impersonated_entity: 'Bank',
      urgency_cues: ['now', 'immediately', 'last chance'],
      confidence: 1,
    });
    const fired = r8FromSignals(everything);
    expect(fired?.points).toBe(AI_CONFIG.r8.capPoints);
    expect(fired?.facts.capped).toBe(true);
  });

  it('adds nothing for a message the model calls safe', () => {
    expect(r8FromSignals(signals())).toBeNull();
    expect(r8FromSignals(null)).toBeNull();
  });

  it('can never lower a rule-based score, whatever the model says', () => {
    const risky = facts({
      txnType: 'collect',
      note: 'Refund',
      payerPriorPaymentsToPayee: 0,
      payeeAccountAgeDays: 1,
      payeeDistinctNewSenders: 20,
    });
    const rulesOnly = scoreFromFacts(risky, null);
    const calm = signals({ scam_type: 'none', money_direction_claimed: 'pay', confidence: 1 });
    const withAi = scoreFromFacts(risky, calm);
    expect(withAi.score).toBeGreaterThanOrEqual(rulesOnly.score);
    expect(withAi.decision).toBe(rulesOnly.decision);
    expect(withAi.aiPoints).toBe(0);
  });

  it('ignores a low-confidence scam label but still counts a PIN request', () => {
    const unsure = signals({ scam_type: 'investment', impersonated_entity: 'RBI', confidence: 0.2 });
    expect(r8FromSignals(unsure)).toBeNull();
    const pin = signals({ asks_for_pin_or_otp: true, confidence: 0.2 });
    expect(r8FromSignals(pin)?.points).toBe(AI_CONFIG.r8.points.asksForPinOrOtp);
  });
});

describe('explanations and grounding', () => {
  const scored = scoreFromFacts(
    facts({
      txnType: 'collect',
      note: 'Refund',
      amountPaise: 4_999_00,
      payerPriorPaymentsToPayee: 0,
      payeeAccountAgeDays: 2,
      payeeDistinctNewSenders: 37,
    }),
    null,
  );
  const ctx = { txnType: 'collect' as const, amountPaise: 4_999_00, payeeName: 'Refund Desk' };

  it('has a template for every rule in every language', () => {
    for (const lang of ['en', 'hi', 'bn'] as const) {
      const t = templateExplanation(scored.fired, lang, ctx);
      expect(t.reasons).toHaveLength(scored.fired.length);
      expect(t.reasons.every((r) => r.length > 10)).toBe(true);
      expect(t.headline).toContain('4,999');
      expect(t.source).toBe('template');
    }
    const en = templateExplanation(scored.fired, 'en', ctx);
    expect(en.headline).toContain('OUT of your account');
    expect(en.reasons.join(' ')).toContain('37 new senders');
    expect(en.reasons.join(' ')).toContain('2 days ago');
  });

  it('extracts numbers written with regional digits and separators', () => {
    expect(extractNumbers('₹4,999 and ३७ senders, ২ দিন, 1.50')).toEqual(['4999', '37', '2', '1.5']);
  });

  it('accepts AI wording that only uses numbers from the facts', () => {
    const template = templateExplanation(scored.fired, 'en', ctx);
    const good = {
      headline: 'Stop: approving sends ₹4,999 out of your account.',
      reasons: [
        'It says refund.',
        'New payee.',
        '₹4,999 is 12.5 times your usual ₹400.',
        'Account is 2 days old.',
        '37 new senders in 24 hours.',
      ],
    };
    expect(isGrounded(good, template)).toBe(true);
    expect(chooseExplanation(template, good, false).source).toBe('ai');
  });

  it('falls back to the template when AI invents a number or drops a reason', () => {
    const template = templateExplanation(scored.fired, 'en', ctx);
    const invented = {
      headline: 'Approving sends ₹4,999 out.',
      reasons: ['Refund.', 'New payee.', 'Large amount.', 'Account is 2 days old.', '52 new senders today.'],
    };
    expect(isGrounded(invented, template)).toBe(false);
    expect(chooseExplanation(template, invented, false)).toBe(template);
    const short = { headline: 'Approving sends ₹4,999 out.', reasons: ['Refund.'] };
    expect(chooseExplanation(template, short, false)).toBe(template);
    expect(chooseExplanation(template, null, false)).toBe(template);
  });
});
