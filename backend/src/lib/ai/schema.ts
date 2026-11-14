import { z } from 'zod';
import { MONEY_DIRECTIONS, SCAM_TYPES } from '@/config/ai';

/**
 * The only shape Gemini's G1 output is allowed to take. Anything else is
 * dropped. Strings are length-limited and the confidence is range-checked, so
 * a manipulated response cannot smuggle extra fields or oversized text.
 */
export const scamSignalsSchema = z
  .object({
    scam_type: z.enum(SCAM_TYPES),
    claimed_purpose: z.string().max(200),
    money_direction_claimed: z.enum(MONEY_DIRECTIONS),
    urgency_cues: z.array(z.string().max(80)).max(8),
    impersonated_entity: z.string().max(80).nullable(),
    asks_for_pin_or_otp: z.boolean(),
    extracted_vpa: z.string().max(80).nullable(),
    extracted_amount: z.number().min(0).max(1e9).nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type ScamSignals = z.infer<typeof scamSignalsSchema>;

/** JSON Schema sent to Gemini as the structured-output contract. */
export const scamSignalsJsonSchema = {
  type: 'object',
  properties: {
    scam_type: {
      type: 'string',
      enum: [...SCAM_TYPES],
      description: 'Best matching scam category, or "none" for a legitimate message.',
    },
    claimed_purpose: {
      type: 'string',
      description: 'What the message says the payment or action is for, in at most 15 words.',
    },
    money_direction_claimed: {
      type: 'string',
      enum: [...MONEY_DIRECTIONS],
      description:
        'What the message tells the reader will happen: "receive" if it says they will get money, "pay" if it asks them to pay, "unclear" otherwise.',
    },
    urgency_cues: {
      type: 'array',
      items: { type: 'string' },
      description: 'Short quotes that create time pressure or fear. Empty if none.',
    },
    impersonated_entity: {
      type: ['string', 'null'],
      description: 'Organisation or role the sender claims to be, or null.',
    },
    asks_for_pin_or_otp: {
      type: 'boolean',
      description: 'True if the message asks the reader to enter or share a PIN, OTP, CVV or password.',
    },
    extracted_vpa: { type: ['string', 'null'], description: 'UPI ID found in the message, or null.' },
    extracted_amount: {
      type: ['number', 'null'],
      description: 'Rupee amount found in the message as a plain number, or null.',
    },
    confidence: { type: 'number', description: 'Confidence in scam_type, from 0 to 1.' },
  },
  required: [
    'scam_type',
    'claimed_purpose',
    'money_direction_claimed',
    'urgency_cues',
    'impersonated_entity',
    'asks_for_pin_or_otp',
    'extracted_vpa',
    'extracted_amount',
    'confidence',
  ],
} as const;

/** G2 output: a headline and one sentence per fired rule. */
export const explanationSchema = z
  .object({
    headline: z.string().min(1).max(300),
    reasons: z.array(z.string().min(1).max(300)).max(8),
  })
  .strict();

export const explanationJsonSchema = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    reasons: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'reasons'],
} as const;
