import { getDb } from '@/db/client';
import { createGeminiAi } from './gemini';
import type { AiPort } from './port';
import { createGeminiTransport, type Transport } from './transport';

export type AiMode = { enabled: boolean; reason: 'ok' | 'no_key' | 'disabled'; cache: boolean };

export function aiMode(): AiMode {
  const cache = process.env.AI_CACHE === '1';
  if (process.env.AI_DISABLED === '1') return { enabled: false, reason: 'disabled', cache };
  if (!process.env.GEMINI_API_KEY) return { enabled: false, reason: 'no_key', cache };
  return { enabled: true, reason: 'ok', cache };
}

let transport: Transport | null = null;
let transportKey: string | null = null;

/** The shared Gemini transport, or null when AI is off. */
export function getTransport(): Transport | null {
  if (!aiMode().enabled) return null;
  const key = process.env.GEMINI_API_KEY!;
  if (!transport || transportKey !== key) {
    transport = createGeminiTransport(key);
    transportKey = key;
  }
  return transport;
}

/**
 * The AI used on the payment path, or null. With null the app runs in
 * rules-only mode: every payment flow works, and the UI says the AI check
 * is unavailable.
 */
export function getAi(): AiPort | null {
  const t = getTransport();
  if (!t) return null;
  return createGeminiAi({ transport: t, db: getDb(), useCache: aiMode().cache });
}
