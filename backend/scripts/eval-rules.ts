import './_env';
import { closeDb, getDb } from '../src/db/client';
import { evalRuns } from '../src/db/schema';
import { writeEvalDoc } from '../src/lib/eval/doc';
import { configSnapshot, evaluateDetection, loadLabelledHistory, pct } from '../src/lib/eval/metrics';

/** Rules-only evaluation on the labelled synthetic history. No AI is involved. */
async function main() {
  const db = getDb();
  const { labelled, index } = await loadLabelledHistory(db);
  if (labelled.length === 0) {
    console.error('No labelled transactions found. Run `npm run db:seed` first.');
    process.exit(1);
  }
  const { metrics } = evaluateDetection(labelled, index);

  console.log(`\nRules-only evaluation on ${metrics.transactions} labelled payments`);
  console.log(`(${metrics.fraud} fraud, ${metrics.legit} legitimate; flagged = warn or hold)\n`);
  console.table(
    metrics.scenarios.map((s) => ({
      scenario: s.scenario,
      label: s.isFraud ? 'fraud' : 'legit',
      total: s.total,
      flagged: s.flagged,
      held: s.held,
      [s.isFraud ? 'recall' : 'false positive rate']: pct(s.flagged / s.total),
    })),
  );
  console.table({
    precision: pct(metrics.precision),
    recall: pct(metrics.recall),
    'false positive rate': pct(metrics.falsePositiveRate),
    'fraud blocked outright (hold)': pct(metrics.holdRecall),
    'legit blocked outright (hold)': pct(metrics.holdFalsePositiveRate),
  });
  console.table(metrics.ruleFires);

  await db.insert(evalRuns).values({
    kind: 'rules',
    results: { generatedAt: new Date().toISOString(), config: configSnapshot(), metrics },
  });
  const path = await writeEvalDoc(db);
  console.log(`Saved to the database and ${path}`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
