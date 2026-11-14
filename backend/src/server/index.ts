import { config } from 'dotenv';
config({ path: ['.env.local', '.env'], quiet: true });

import { serve } from '@hono/node-server';
import { allowedOrigins, loadEnv } from '@/config/env';
import { closeDb } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { createApp } from './app';

async function main() {
  const env = loadEnv();
  if (env.MIGRATE_ON_START === '1') {
    await runMigrations(env.DATABASE_URL);
    console.log('Database migrations are up to date.');
  }
  const origins = allowedOrigins(env);
  const app = createApp({ origins });
  const server = serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
    console.log(`Kavach Pay API listening on :${info.port} (auth ${env.AUTH_DISABLED === '1' ? 'off' : 'on'}, origins ${origins.join(', ')})`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down.`);
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
