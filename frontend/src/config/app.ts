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

  /** Simulated opening balance for a new signed-in user's account (paise). */
  openingBalancePaise: 10_000_00,

  /** Demo-trial sessions (shared synthetic personas, no Clerk account). */
  demoSessionHours: 12,
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

/**
 * Official places to report a suspected payment fraud in India (checked 14 Nov 2026).
 * Sources: https://sancharsaathi.gov.in/sfc/ ("If you have already lost money, please
 * report at cyber crime helpline 1930 or cybercrime.gov.in"; Chakshu is for suspected
 * fraud calls, SMS and WhatsApp) and https://cms.rbi.org.in/ (RBI complaints).
 * The same list is printed in the transaction PDF (backend/src/config/reporting.ts).
 */
export const REPORTING_CHANNELS = [
  { id: 'cybercrime', name: 'National Cyber Crime Reporting Portal', url: 'https://cybercrime.gov.in/', label: 'cybercrime.gov.in', hint: 'reportCybercrime' },
  { id: 'helpline', name: 'Cyber crime helpline 1930', url: 'tel:1930', label: '1930', hint: 'report1930' },
  { id: 'chakshu', name: 'Chakshu · Sanchar Saathi (DoT)', url: 'https://sancharsaathi.gov.in/sfc/', label: 'sancharsaathi.gov.in/sfc', hint: 'reportChakshu' },
  { id: 'rbi', name: 'RBI Complaint Management System', url: 'https://cms.rbi.org.in/', label: 'cms.rbi.org.in', hint: 'reportRbi' },
] as const;
