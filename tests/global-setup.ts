import { runMigrations } from '../src/db/migrate';
import { applyTestEnv } from './test-env';

export default async function globalSetup() {
  const url = applyTestEnv();
  try {
    await runMigrations(url);
  } catch (err) {
    throw new Error(
      `Could not migrate the test database at ${url.replace(/:[^:@/]+@/, ':***@')}.\n` +
        'Start it with `docker compose up -d` or set TEST_DATABASE_URL.\n' +
        String(err),
    );
  }
}
