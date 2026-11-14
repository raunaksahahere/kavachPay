import './_env';
import { closeDb, getDb } from '../src/db/client';
import { generateDataset } from '../src/lib/seed/generate';
import { DEMO_PIN, loadDataset } from '../src/lib/seed/load';

/** Fixed seed: every run produces the same users, payments and labels. */
export const SEED = 20261114;

async function main() {
  const started = Date.now();
  const data = generateDataset(SEED, new Date());
  const counts = await loadDataset(getDb(), data);
  console.log(`Seeded with seed ${SEED} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.table(counts);
  console.log(`Demo PIN for every account: ${DEMO_PIN}`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
