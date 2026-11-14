import type { Lang } from '@/config/app';
import { DECISION_LABELS, templateExplanation } from '@/lib/risk/explain';
import type { Explanation, FiredRule } from '@/lib/risk/types';

export type SpokenInput = {
  decision: 'allow' | 'warn' | 'hold';
  score: number;
  firedRules: FiredRule[];
  storedExplanation: Explanation | null;
  txnType: 'pay' | 'collect';
  amountPaise: number;
  payeeName: string;
};

const SCORE: Record<Lang, (n: number) => string> = {
  en: (n) => `Risk score ${n} out of 100.`,
  hi: (n) => `जोखिम स्कोर 100 में से ${n}।`,
  bn: (n) => `ঝুঁকি স্কোর 100-এর মধ্যে ${n}।`,
};

const CLOSING: Record<Lang, string> = {
  en: 'Never share your UPI PIN or OTP with anyone.',
  hi: 'अपना UPI पिन या ओटीपी कभी किसी के साथ साझा न करें।',
  bn: 'আপনার UPI পিন বা ওটিপি কখনও কাউকে দেবেন না।',
};

/**
 * The words read aloud. When the stored explanation is already in the chosen
 * language it is reused, so the voice says exactly what the screen shows
 * (it already passed the grounding check). Otherwise the deterministic
 * template for that language is used. Either way every fact comes from the
 * stored rule trace, never from the client.
 */
export function spokenReason(input: SpokenInput, lang: Lang): string {
  const explanation =
    input.storedExplanation && input.storedExplanation.lang === lang
      ? input.storedExplanation
      : templateExplanation(input.firedRules, lang, {
          txnType: input.txnType,
          amountPaise: input.amountPaise,
          payeeName: input.payeeName,
        });
  const end = (s: string) => (/[.!?।]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
  return [DECISION_LABELS[lang][input.decision] + '.', SCORE[lang](input.score), end(explanation.headline), ...explanation.reasons.map(end), CLOSING[lang]].join(' ');
}
