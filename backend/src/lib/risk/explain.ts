import { formatRupees, type Lang } from '@/config/app';
import type { Decision } from '@/config/risk';
import type { Explanation, FiredRule } from './types';

/**
 * Deterministic warning text for every rule in every supported language.
 * This is what the user sees whenever Gemini is off, slow, wrong or ungrounded.
 */

type Ctx = { txnType: 'pay' | 'collect'; amountPaise: number; payeeName: string };
type Facts = FiredRule['facts'];

const SCAM_LABELS: Record<string, Record<Lang, string>> = {
  refund_collect: { en: 'fake refund request', hi: 'नकली रिफंड अनुरोध', bn: 'ভুয়া রিফান্ড অনুরোধ' },
  fake_qr: { en: 'fake QR code', hi: 'नकली क्यूआर कोड', bn: 'ভুয়া কিউআর কোড' },
  kyc_phishing: { en: 'fake KYC update', hi: 'नकली केवाईसी अपडेट', bn: 'ভুয়া কেওয়াইসি আপডেট' },
  otp_phishing: { en: 'PIN or OTP theft', hi: 'पिन या ओटीपी की चोरी', bn: 'পিন বা ওটিপি চুরি' },
  screen_share: { en: 'screen-sharing app scam', hi: 'स्क्रीन शेयरिंग ऐप धोखा', bn: 'স্ক্রিন শেয়ারিং অ্যাপ প্রতারণা' },
  lottery_prize: { en: 'fake prize or lottery', hi: 'नकली इनाम या लॉटरी', bn: 'ভুয়া পুরস্কার বা লটারি' },
  investment: { en: 'fake investment offer', hi: 'नकली निवेश योजना', bn: 'ভুয়া বিনিয়োগ প্রস্তাব' },
  impersonation: { en: 'impersonation', hi: 'पहचान बदलकर धोखा', bn: 'ছদ্মবেশে প্রতারণা' },
  other: { en: 'suspicious message', hi: 'संदिग्ध संदेश', bn: 'সন্দেহজনক বার্তা' },
  none: { en: 'suspicious message', hi: 'संदिग्ध संदेश', bn: 'সন্দেহজনক বার্তা' },
};

const rupees = (v: Facts[string]) => formatRupees(Number(v));

const HEADLINES: Record<Lang, { collect: (c: Ctx) => string; pay: (c: Ctx) => string }> = {
  en: {
    collect: (c) =>
      `Approving this request sends ${formatRupees(c.amountPaise)} OUT of your account. You will not receive money.`,
    pay: (c) => `You are about to send ${formatRupees(c.amountPaise)} to ${c.payeeName}.`,
  },
  hi: {
    collect: (c) =>
      `इस अनुरोध को स्वीकार करने पर आपके खाते से ${formatRupees(c.amountPaise)} कट जाएंगे। आपको पैसे नहीं मिलेंगे।`,
    pay: (c) => `आप ${c.payeeName} को ${formatRupees(c.amountPaise)} भेजने वाले हैं।`,
  },
  bn: {
    collect: (c) =>
      `এই অনুরোধ অনুমোদন করলে আপনার অ্যাকাউন্ট থেকে ${formatRupees(c.amountPaise)} কেটে যাবে। আপনি কোনো টাকা পাবেন না।`,
    pay: (c) => `আপনি ${c.payeeName}-কে ${formatRupees(c.amountPaise)} পাঠাতে চলেছেন।`,
  },
};

const REASONS: Record<Lang, Record<FiredRule['id'], (f: Facts) => string>> = {
  en: {
    R1_DIRECTION_MISMATCH: (f) =>
      `The request mentions "${f.keyword}", which suggests you will receive money. A collect request can only take money from you.`,
    R2_NEW_PAYEE: () => 'You have never paid this payee before.',
    R3_AMOUNT_ANOMALY: (f) =>
      `${rupees(f.amountPaise)} is ${f.multiple} times your usual payment of about ${rupees(f.medianPaise)}.`,
    R4_VELOCITY: (f) =>
      `${f.count} payments were started from your account in the last ${f.windowMinutes} minutes.`,
    R5_YOUNG_PAYEE: (f) =>
      Number(f.ageDays) === 0
        ? "This payee's account was created today."
        : `This payee's account was created ${f.ageDays} days ago.`,
    R6_MULE_FAN_IN: (f) =>
      `This payee received money from ${f.senders} new senders in the last ${f.windowHours} hours.`,
    R7_PASS_THROUGH: (f) =>
      `This payee forwarded ${f.forwardedPercent}% of the money it received within ${f.windowMinutes} minutes.`,
    R8_AI_SIGNALS: (f) =>
      `The message shows signs of a scam (${SCAM_LABELS[String(f.scamType)]?.en ?? SCAM_LABELS.other.en}).` +
      (f.asksForPinOrOtp ? ' It asks for your PIN or OTP. Never share them.' : ''),
  },
  hi: {
    R1_DIRECTION_MISMATCH: (f) =>
      `अनुरोध में "${f.keyword}" लिखा है, जिससे लगता है कि आपको पैसे मिलेंगे। कलेक्ट रिक्वेस्ट से सिर्फ आपके खाते से पैसे कटते हैं।`,
    R2_NEW_PAYEE: () => 'आपने इस खाते में पहले कभी भुगतान नहीं किया है।',
    R3_AMOUNT_ANOMALY: (f) =>
      `${rupees(f.amountPaise)} आपके सामान्य भुगतान (लगभग ${rupees(f.medianPaise)}) से ${f.multiple} गुना है।`,
    R4_VELOCITY: (f) =>
      `पिछले ${f.windowMinutes} मिनट में आपके खाते से ${f.count} भुगतान शुरू किए गए हैं।`,
    R5_YOUNG_PAYEE: (f) =>
      Number(f.ageDays) === 0
        ? 'यह खाता आज ही बना है।'
        : `यह खाता सिर्फ ${f.ageDays} दिन पहले बना है।`,
    R6_MULE_FAN_IN: (f) =>
      `पिछले ${f.windowHours} घंटों में इस खाते में ${f.senders} नए लोगों से पैसे आए हैं।`,
    R7_PASS_THROUGH: (f) =>
      `इस खाते ने मिले हुए पैसों का ${f.forwardedPercent}% हिस्सा ${f.windowMinutes} मिनट के अंदर आगे भेज दिया।`,
    R8_AI_SIGNALS: (f) =>
      `संदेश में धोखाधड़ी के संकेत हैं (${SCAM_LABELS[String(f.scamType)]?.hi ?? SCAM_LABELS.other.hi})।` +
      (f.asksForPinOrOtp ? ' इसमें आपका पिन या ओटीपी मांगा गया है। इन्हें कभी साझा न करें।' : ''),
  },
  bn: {
    R1_DIRECTION_MISMATCH: (f) =>
      `অনুরোধে "${f.keyword}" লেখা আছে, যাতে মনে হয় আপনি টাকা পাবেন। কালেক্ট রিকোয়েস্টে শুধু আপনার অ্যাকাউন্ট থেকেই টাকা কাটা হয়।`,
    R2_NEW_PAYEE: () => 'আপনি আগে কখনও এই অ্যাকাউন্টে টাকা পাঠাননি।',
    R3_AMOUNT_ANOMALY: (f) =>
      `${rupees(f.amountPaise)} আপনার সাধারণ লেনদেনের (প্রায় ${rupees(f.medianPaise)}) ${f.multiple} গুণ।`,
    R4_VELOCITY: (f) =>
      `গত ${f.windowMinutes} মিনিটে আপনার অ্যাকাউন্ট থেকে ${f.count}টি পেমেন্ট শুরু হয়েছে।`,
    R5_YOUNG_PAYEE: (f) =>
      Number(f.ageDays) === 0
        ? 'এই অ্যাকাউন্টটি আজই খোলা হয়েছে।'
        : `এই অ্যাকাউন্টটি মাত্র ${f.ageDays} দিন আগে খোলা হয়েছে।`,
    R6_MULE_FAN_IN: (f) =>
      `গত ${f.windowHours} ঘণ্টায় এই অ্যাকাউন্টে ${f.senders} জন নতুন প্রেরকের কাছ থেকে টাকা এসেছে।`,
    R7_PASS_THROUGH: (f) =>
      `এই অ্যাকাউন্ট প্রাপ্ত টাকার ${f.forwardedPercent}% মাত্র ${f.windowMinutes} মিনিটের মধ্যে অন্যত্র পাঠিয়ে দিয়েছে।`,
    R8_AI_SIGNALS: (f) =>
      `বার্তায় প্রতারণার লক্ষণ আছে (${SCAM_LABELS[String(f.scamType)]?.bn ?? SCAM_LABELS.other.bn})।` +
      (f.asksForPinOrOtp ? ' এতে আপনার পিন বা ওটিপি চাওয়া হয়েছে। এগুলো কখনও কাউকে দেবেন না।' : ''),
  },
};

export const DECISION_LABELS: Record<Lang, Record<Decision, string>> = {
  en: { allow: 'Looks safe', warn: 'Check before you pay', hold: 'Payment stopped' },
  hi: { allow: 'सुरक्षित लगता है', warn: 'भुगतान से पहले जांचें', hold: 'भुगतान रोका गया' },
  bn: { allow: 'নিরাপদ মনে হচ্ছে', warn: 'পেমেন্টের আগে যাচাই করুন', hold: 'পেমেন্ট থামানো হয়েছে' },
};

export function reasonText(rule: FiredRule, lang: Lang): string {
  return REASONS[lang][rule.id](rule.facts);
}

export function templateExplanation(fired: FiredRule[], lang: Lang, ctx: Ctx): Explanation {
  return {
    lang,
    headline: HEADLINES[lang][ctx.txnType === 'collect' ? 'collect' : 'pay'](ctx),
    reasons: fired.map((rule) => reasonText(rule, lang)),
    source: 'template',
  };
}

const DIGIT_MAPS: [RegExp, number][] = [
  [/[०-९]/g, 0x0966], // Devanagari digits
  [/[০-৯]/g, 0x09e6], // Bengali digits
];

/** Every number in a text, with regional digits converted and separators removed. */
export function extractNumbers(text: string): string[] {
  let s = text;
  for (const [re, base] of DIGIT_MAPS) {
    s = s.replace(re, (d) => String(d.charCodeAt(0) - base));
  }
  const found = s.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return found.map((n) => n.replace(/,/g, '').replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'));
}

/**
 * Grounding check for AI-written explanations: every number in the candidate
 * text must also appear in the deterministic template for the same rules.
 * A model that invents "52 senders" or a different amount fails.
 */
export function isGrounded(candidate: Explanation | { headline: string; reasons: string[] }, template: Explanation): boolean {
  const allowed = new Set(extractNumbers([template.headline, ...template.reasons].join(' ')));
  const used = extractNumbers([candidate.headline, ...candidate.reasons].join(' '));
  return used.every((n) => allowed.has(n));
}
