import { config } from 'dotenv';

export const DEFAULT_TEST_DATABASE_URL = 'postgresql://kavach:kavach@localhost:5433/kavach_test';

/**
 * Points the code under test at the test database and switches Gemini and ElevenLabs off,
 * so no test ever touches demo data or the network.
 */
export function applyTestEnv(): string {
  config({ path: ['.env.local', '.env'], quiet: true });
  const url = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
  process.env.DATABASE_URL = url;
  delete process.env.GEMINI_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  process.env.AI_DISABLED = '1';
  delete process.env.AI_CACHE;
  return url;
}
