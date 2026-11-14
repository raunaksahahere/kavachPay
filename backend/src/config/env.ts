import { z } from 'zod';

/**
 * Server configuration, read once from the environment and validated, so a
 * misconfigured deployment fails at startup with a clear message instead of
 * on the first request.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /** Comma-separated browser origins allowed to call the API (the frontend). */
  FRONTEND_ORIGINS: z.string().default('http://localhost:3000'),
  AUTH_DISABLED: z.enum(['0', '1']).optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  /** ElevenLabs key for reading risk reasons aloud. Optional: without it the Listen button reports voice unavailable. */
  ELEVENLABS_API_KEY: z.string().optional(),
  /** Run pending database migrations when the server starts. */
  MIGRATE_ON_START: z.enum(['0', '1']).default('1'),
});

export type ServerEnv = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid server configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.AUTH_DISABLED !== '1' && !env.CLERK_SECRET_KEY) {
    throw new Error('CLERK_SECRET_KEY is required unless AUTH_DISABLED=1.');
  }
  return env;
}

export function allowedOrigins(env: Pick<ServerEnv, 'FRONTEND_ORIGINS'>): string[] {
  return env.FRONTEND_ORIGINS.split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}
