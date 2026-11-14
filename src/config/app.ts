/** Non-risk application settings: languages, limits, security parameters. */

export const LANGUAGES = ['en', 'hi', 'bn'] as const;
export type Lang = (typeof LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  hi: 'हिन्दी',
  bn: 'বাংলা',
};

export const APP_CONFIG = {
  /** Largest single payment accepted by the simulated rail (paise). */
  maxAmountPaise: 1_00_000_00,
  maxNoteLength: 140,

  pin: {
    length: 4,
    /** Wrong attempts before the PIN is locked. */
    maxAttempts: 5,
    lockMinutes: 15,
    /** Argon2id parameters, at or above the OWASP minimum (19 MiB, t=2, p=1). */
    argon2: { memoryCost: 19456, timeCost: 2, parallelism: 1 },
  },

  /** Fixed-window rate limits: at most `max` requests per `windowSeconds` per key. */
  rateLimits: {
    payment: { max: 20, windowSeconds: 60 },
    pin: { max: 10, windowSeconds: 60 },
    ai: { max: 20, windowSeconds: 60 },
  },

  /** How long a stored idempotent response is replayed. */
  idempotencyTtlHours: 24,
} as const;

/** Format paise as rupees, e.g. 499900 -> "₹4,999". */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return (
    '₹' +
    rupees.toLocaleString('en-IN', {
      minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}
