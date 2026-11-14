/**
 * ElevenLabs text-to-speech, used only to read a risk decision aloud.
 * Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 *       https://elevenlabs.io/docs/overview/models
 *
 * eleven_v3 is the default because it lists all three app languages
 * (English, Hindi, Bengali); eleven_multilingual_v2 and the Flash models do
 * not list Bengali. The default voice ID is the one used in the official
 * convert-endpoint example; any voice on the account can replace it.
 */
export const VOICE_CONFIG = {
  baseUrl: process.env.ELEVENLABS_BASE_URL ?? 'https://api.elevenlabs.io',
  modelId: process.env.ELEVENLABS_MODEL_ID ?? 'eleven_v3',
  voiceId: process.env.ELEVENLABS_VOICE_ID ?? 'JBFqnCBsd6RMkjVDRZzb',
  outputFormat: 'mp3_44100_128',
  /** eleven_v3 accepts up to 5,000 characters per request; our scripts stay well under. */
  maxChars: 2500,
  timeoutMs: Number(process.env.ELEVENLABS_TIMEOUT_MS ?? 15000),
  /** Spoken clips kept in memory so replaying the same reason costs no credits. */
  cacheEntries: 64,
} as const;
