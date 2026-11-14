/**
 * Gemini configuration. Model IDs are overridable by environment variable so
 * the same build runs on a free-tier key or a paid one.
 *
 * The decision boundary is encoded here as data: Gemini returns signals, and
 * the fixed table below turns signals into R8 points. Gemini never picks points.
 */

export const AI_CONFIG = {
  models: {
    /** Live checks (G1 analyzer, G2 explainer): fastest stable model. */
    live: process.env.GEMINI_MODEL_LIVE ?? 'gemini-3.5-flash-lite',
    /** Analyst copilot (G3): stronger function-calling model that is on the free tier. */
    copilot: process.env.GEMINI_MODEL_COPILOT ?? 'gemini-3.8-flash',
  },

  /** Hard budget for a live call. On expiry the payment continues on rules only. */
  liveTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 4000),
  /** Per-step budget for the copilot, which is not on the payment path. */
  copilotStepTimeoutMs: Number(process.env.AI_COPILOT_TIMEOUT_MS ?? 20000),
  /** Maximum model turns per analyst question. */
  copilotMaxSteps: 6,

  /** Longest message text or note we send, in characters. */
  maxMessageChars: 2000,
  /** Largest screenshot we accept, in bytes. */
  maxImageBytes: 4 * 1024 * 1024,
  allowedImageTypes: ['image/png', 'image/jpeg', 'image/webp'] as const,

  /** R8: the most Gemini can ever add to a score. */
  r8: {
    capPoints: 25,
    /** Signals below this confidence are ignored. */
    minConfidence: 0.5,
    points: {
      asksForPinOrOtp: 15,
      /** Message claims the user will receive money while the action is an outgoing payment. */
      claimsReceiveOnOutgoing: 10,
      scamTypeIdentified: 8,
      impersonation: 5,
      /** Two or more urgency cues. */
      urgency: 4,
    },
  },
} as const;

export const SCAM_TYPES = [
  'none',
  'refund_collect',
  'fake_qr',
  'kyc_phishing',
  'otp_phishing',
  'screen_share',
  'lottery_prize',
  'investment',
  'impersonation',
  'other',
] as const;

export type ScamType = (typeof SCAM_TYPES)[number];

export const MONEY_DIRECTIONS = ['receive', 'pay', 'unclear'] as const;
export type MoneyDirection = (typeof MONEY_DIRECTIONS)[number];
