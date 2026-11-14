import dns from 'node:dns';
import net from 'node:net';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Node's default "happy eyeballs" races IPv4 and IPv6 with a 250 ms budget per
// address. On a network with no IPv6 route and a slow link to the database,
// every attempt is cut off (AggregateError / ECONNRESET). Prefer IPv4 and try
// one address at a time, which is reliable on slow and IPv4-only networks.
dns.setDefaultResultOrder('ipv4first');
net.setDefaultAutoSelectFamily(false);

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Anything that can run queries: the pool-backed client or an open transaction. */
export type DbOrTx = Db | Tx;

type Cached = { pool: Pool; db: Db; url: string };

const globalForDb = globalThis as unknown as { __kavachDb?: Cached };

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.',
    );
  }
  return url;
}

/** One pool per process, reused across hot reloads and function invocations. */
export function getDb(): Db {
  const url = databaseUrl();
  const cached = globalForDb.__kavachDb;
  if (cached && cached.url === url) return cached.db;

  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 30_000,
  });
  const db = drizzle(pool, { schema });
  globalForDb.__kavachDb = { pool, db, url };
  return db;
}

export async function closeDb(): Promise<void> {
  const cached = globalForDb.__kavachDb;
  if (cached) {
    await cached.pool.end();
    globalForDb.__kavachDb = undefined;
  }
}

export { schema };
