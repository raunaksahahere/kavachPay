import { Client } from 'pg';
import { runMigrations } from '../src/db/migrate';
import { closeDb, getDb } from '../src/db/client';
import { generateDataset } from '../src/lib/seed/generate';
import { loadDataset } from '../src/lib/seed/load';

/** Creates (if needed), migrates and seeds the end-to-end test database. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const target = new URL(url);
  const dbName = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
  await client.end();

  await runMigrations(url);
  await loadDataset(getDb(), generateDataset(20261114, new Date()));
  await closeDb();
  console.log(`E2E database ready: ${dbName}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
