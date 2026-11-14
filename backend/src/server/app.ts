import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { ZodError } from 'zod';
import { AI_CONFIG } from '@/config/ai';
import { authEnabled, PUBLIC_PATHS } from '@/config/auth';
import { getDb } from '@/db/client';
import { aiMode } from '@/lib/ai';
import { AppError } from '@/lib/errors';
import { sessionFacts } from './auth';
import { docsPage, openApiDocument } from './openapi';
import { accountRoutes } from './routes/account';
import { analystRoutes } from './routes/analyst';
import { messageRoutes } from './routes/messages';
import { paymentRoutes } from './routes/payments';
import { reportRoutes } from './routes/reports';
import { voiceMode } from '@/lib/voice/elevenlabs';

export type AppOptions = {
  /** Browser origins allowed to call the API with credentials. */
  origins: string[];
  /** Turn off request logging (tests). */
  quiet?: boolean;
};

export const VERSION = '1.0.0';

export function createApp(opts: AppOptions) {
  const app = new Hono();

  app.use('*', requestId());
  if (!opts.quiet) app.use('*', logger());
  app.use('*', secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }));
  app.use(
    '/api/*',
    cors({
      origin: (origin) => (opts.origins.includes(origin) ? origin : null),
      credentials: true,
      allowHeaders: ['Content-Type', 'Idempotency-Key', 'Authorization', 'X-Demo-Session'],
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      exposeHeaders: ['Idempotent-Replayed', 'Retry-After', 'X-Request-Id', 'Content-Disposition', 'X-Voice-Cached'],
      maxAge: 600,
    }),
  );
  // Screenshots for the message check are sent inline; 6 MB covers a 4 MB image in base64.
  app.use('/api/*', bodyLimit({ maxSize: 6 * 1024 * 1024, onError: () => { throw new AppError(413, 'too_large', 'Request body is too large.'); } }));
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (authEnabled() && !PUBLIC_PATHS.has(c.req.path) && c.req.method !== 'OPTIONS') {
      const s = await sessionFacts(c);
      if (!s.clerkUserId && !s.demoUserId) throw new AppError(401, 'unauthenticated', 'Please sign in.');
    }
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof AppError) {
      const retry = err.details?.retryAfterSeconds;
      if (typeof retry === 'number') c.header('Retry-After', String(retry));
      return c.json(err.toBody(), err.status as 400);
    }
    if (err instanceof ZodError) {
      return c.json(
        {
          error: {
            code: 'invalid_request',
            message: 'The request is not valid.',
            issues: err.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message })),
          },
        },
        400,
      );
    }
    console.error(`[${c.get('requestId')}]`, err);
    return c.json({ error: { code: 'internal', message: 'Something went wrong. No money was moved.' } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: 'not_found', message: `No route for ${c.req.method} ${c.req.path}` } }, 404));

  /** Liveness: the process is up. Used by Render's health check. */
  app.get('/health', (c) => c.json({ ok: true, version: VERSION, uptimeSeconds: Math.round(process.uptime()) }));

  /** Readiness: database reachable, which AI and sign-in modes are active. */
  app.get('/api/status', async (c) => {
    let database = 'ok';
    try {
      await getDb().execute(sql`SELECT 1`);
    } catch {
      database = 'unavailable';
    }
    const mode = aiMode();
    return c.json(
      {
        service: 'kavach-pay-api',
        version: VERSION,
        commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
        database,
        ai: { enabled: mode.enabled, reason: mode.reason, cache: mode.cache, models: AI_CONFIG.models },
        auth: { enabled: authEnabled() },
        voice: voiceMode(),
      },
      database === 'ok' ? 200 : 503,
    );
  });

  app.get('/openapi.json', (c) => c.json(openApiDocument(VERSION)));
  app.get('/docs', (c) => c.html(docsPage()));
  app.get('/', (c) => c.redirect('/docs'));

  app.route('/api', accountRoutes);
  app.route('/api', paymentRoutes);
  app.route('/api', messageRoutes);
  app.route('/api', analystRoutes);
  app.route('/api', reportRoutes);

  return app;
}
