import { createHash } from 'node:crypto';
import type { Lang } from '@/config/app';
import { VOICE_CONFIG } from '@/config/voice';
import { AppError } from '@/lib/errors';

export type VoiceMode = { enabled: boolean; reason: 'ok' | 'no_key' | 'disabled' };

export function voiceMode(): VoiceMode {
  if (process.env.VOICE_DISABLED === '1') return { enabled: false, reason: 'disabled' };
  if (!process.env.ELEVENLABS_API_KEY) return { enabled: false, reason: 'no_key' };
  return { enabled: true, reason: 'ok' };
}

const cache = new Map<string, Uint8Array>();

function remember(key: string, audio: Uint8Array) {
  cache.delete(key);
  cache.set(key, audio);
  while (cache.size > VOICE_CONFIG.cacheEntries) cache.delete(cache.keys().next().value!);
}

/** For tests. */
export function clearVoiceCache() {
  cache.clear();
}

/**
 * Turns server-built text into MP3 audio. The text is never taken from the
 * client, so this endpoint cannot be used as a general text-to-speech proxy.
 */
export async function synthesizeSpeech(
  text: string,
  lang: Lang,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<{ audio: Uint8Array; cached: boolean }> {
  const mode = voiceMode();
  if (!mode.enabled) throw new AppError(503, 'voice_unavailable', 'Voice playback is not set up on this server.');
  const input = text.slice(0, VOICE_CONFIG.maxChars);
  const key = createHash('sha256').update(`${VOICE_CONFIG.modelId}|${VOICE_CONFIG.voiceId}|${lang}|${input}`).digest('hex');
  const hit = cache.get(key);
  if (hit) {
    remember(key, hit);
    return { audio: hit, cached: true };
  }

  const url = `${VOICE_CONFIG.baseUrl}/v1/text-to-speech/${encodeURIComponent(VOICE_CONFIG.voiceId)}?output_format=${VOICE_CONFIG.outputFormat}`;
  const body: Record<string, unknown> = { text: input, model_id: VOICE_CONFIG.modelId };
  // language_code is ignored by models that do not support it and must not be sent to multilingual_v2.
  if (!VOICE_CONFIG.modelId.startsWith('eleven_multilingual_v2')) body.language_code = lang;

  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(VOICE_CONFIG.timeoutMs),
    });
  } catch {
    throw new AppError(504, 'voice_timeout', 'The voice service did not answer in time. Please try again.');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`[voice] ElevenLabs ${res.status}: ${detail.slice(0, 300)}`);
    throw new AppError(502, 'voice_failed', 'The voice service could not read this out right now.');
  }
  const audio = new Uint8Array(await res.arrayBuffer());
  if (audio.byteLength === 0) throw new AppError(502, 'voice_failed', 'The voice service returned no audio.');
  remember(key, audio);
  return { audio, cached: false };
}
