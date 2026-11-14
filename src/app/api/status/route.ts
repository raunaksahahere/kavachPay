import { sql } from 'drizzle-orm';
import { AI_CONFIG } from '@/config/ai';
import { authEnabled } from '@/config/auth';
import { getDb } from '@/db/client';
import { aiMode } from '@/lib/ai';
import { handle } from '@/lib/api/http';

export const GET = handle(async () => {
  let database = 'ok';
  try {
    await getDb().execute(sql`SELECT 1`);
  } catch {
    database = 'unavailable';
  }
  const mode = aiMode();
  return Response.json({
    database,
    ai: { enabled: mode.enabled, reason: mode.reason, cache: mode.cache, models: AI_CONFIG.models },
    auth: { enabled: authEnabled() },
  });
}, { public: true });
