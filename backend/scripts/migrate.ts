import './_env';
import { runMigrations } from '../src/db/migrate';

async function main() {
  const target = process.argv.includes('--test') ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
  const url = process.env[target];
  if (!url) {
    console.error(`${target} is not set. Copy .env.example to .env.local and fill it in.`);
    process.exit(1);
  }
  await runMigrations(url);
  console.log(`Migrations applied (${target}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
