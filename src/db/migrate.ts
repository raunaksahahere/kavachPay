import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { Pool } from 'pg';

/** Applies every pending migration in ./drizzle to the given database. */
export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: path.resolve(process.cwd(), 'drizzle'),
    });
  } finally {
    await pool.end();
  }
}
