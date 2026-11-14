import { AI_CONFIG } from '@/config/ai';
import type { ScamSignals } from '@/lib/ai/schema';
import type { FiredRule } from './types';

/**
 * R8: turns Gemini's validated signals into points with a FIXED table.
 * Gemini never chooses points, the total is capped, and the result is never
 * negative, so AI output can raise a score but can never lower one.
 */
export function r8FromSignals(signals: ScamSignals | null): FiredRule | null {
  if (!signals) return null;
  const c = AI_CONFIG.r8;
  const confident = signals.confidence >= c.minConfidence;
  const parts: Record<string, number> = {};

  // A request for a PIN or OTP is a hard fact about the text, so it counts
  // regardless of how confident the model is about the scam category.
  if (signals.asks_for_pin_or_otp) parts.asksForPinOrOtp = c.points.asksForPinOrOtp;
  if (signals.money_direction_claimed === 'receive') {
    parts.claimsReceiveOnOutgoing = c.points.claimsReceiveOnOutgoing;
  }
  if (confident && signals.scam_type !== 'none') parts.scamTypeIdentified = c.points.scamTypeIdentified;
  if (confident && signals.impersonated_entity) parts.impersonation = c.points.impersonation;
  if (signals.urgency_cues.length >= 2) parts.urgency = c.points.urgency;

  const raw = Object.values(parts).reduce((a, b) => a + b, 0);
  const points = Math.max(0, Math.min(c.capPoints, raw));
  if (points === 0) return null;

  return {
    id: 'R8_AI_SIGNALS',
    points,
    facts: {
      scamType: signals.scam_type,
      asksForPinOrOtp: signals.asks_for_pin_or_otp,
      claimsReceive: signals.money_direction_claimed === 'receive',
      impersonatedEntity: signals.impersonated_entity ?? '',
      capped: raw > c.capPoints,
    },
  };
}
