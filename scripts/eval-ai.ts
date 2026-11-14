import './_env';
import { readFile } from 'node:fs/promises';
import { AI_CONFIG } from '../src/config/ai';
import { closeDb, getDb } from '../src/db/client';
import { evalRuns } from '../src/db/schema';
import { createGeminiAi } from '../src/lib/ai/gemini';
import { getTransport } from '../src/lib/ai/index';
import type { AnalyzeOutcome } from '../src/lib/ai/port';
import type { ScamSignals } from '../src/lib/ai/schema';
import type { AiRun } from '../src/lib/eval/doc';
import { writeEvalDoc } from '../src/lib/eval/doc';
import { evaluateDetection, loadLabelledHistory, pct } from '../src/lib/eval/metrics';
import { isGrounded, templateExplanation } from '../src/lib/risk/explain';

/**
 * Measures what Gemini actually adds. Needs GEMINI_API_KEY and a seeded
 * database. Results are saved to the database and to docs/eval.md.
 *
 *   npm run eval:ai
 *   EVAL_CONCURRENCY=2 EVAL_TIMEOUT_MS=15000 npm run eval:ai
 */

type Labelled = {
  id: string;
  lang: string;
  text: string;
  label: {
    scam_type: string;
    money_direction_claimed: string | null;
    asks_for_pin_or_otp: boolean;
  };
};

const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 4);
/** Offline evaluation is not on the payment path, so it allows more time per call than the live 4 s budget. */
const TIMEOUT_MS = Number(process.env.EVAL_TIMEOUT_MS ?? 15_000);

async function pool<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries transient failures (rate limits, timeouts) a few times with backoff. */
async function withRetry<T extends { status: string }>(call: () => Promise<T>): Promise<T> {
  let last: T | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    last = await call();
    if (last.status !== 'error' && last.status !== 'timeout') return last;
    await sleep(1500 * 2 ** attempt);
  }
  return last!;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main() {
  const transport = getTransport();
  if (!transport) {
    console.error('GEMINI_API_KEY is not set (or AI_DISABLED=1). Add it to .env.local and run again.');
    process.exit(1);
  }
  const db = getDb();
  const ai = createGeminiAi({ transport, db, useCache: false, timeoutMs: TIMEOUT_MS });
  const model = AI_CONFIG.models.live;
  console.log(`Model ${model}, concurrency ${CONCURRENCY}, timeout ${TIMEOUT_MS} ms`);

  // ---------- 1. Extractor accuracy on the labelled message set ----------
  const file = JSON.parse(await readFile('eval/messages/messages.json', 'utf8')) as { messages: Labelled[] };
  const messages = file.messages;
  let done = 0;
  const outcomes: AnalyzeOutcome[] = await pool(messages, CONCURRENCY, async (m) => {
    const r = await withRetry(() => ai.analyze({ text: m.text }));
    done++;
    if (done % 10 === 0) console.log(`  analysed ${done}/${messages.length} messages`);
    return r;
  });

  const fields = {
    scam_type: { correct: 0, total: 0 },
    money_direction_claimed: { correct: 0, total: 0 },
    asks_for_pin_or_otp: { correct: 0, total: 0 },
  };
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  const mistakes: string[] = [];
  messages.forEach((m, i) => {
    const s = outcomes[i].signals;
    const check = (field: keyof typeof fields, expected: unknown, actual: unknown) => {
      if (expected === null) return;
      fields[field].total++;
      if (s && actual === expected) fields[field].correct++;
      else mistakes.push(`${m.id} ${field}: expected ${String(expected)}, got ${s ? String(actual) : outcomes[i].status}`);
    };
    check('scam_type', m.label.scam_type, s?.scam_type);
    check('money_direction_claimed', m.label.money_direction_claimed, s?.money_direction_claimed);
    check('asks_for_pin_or_otp', m.label.asks_for_pin_or_otp, s?.asks_for_pin_or_otp);
    const isScam = m.label.scam_type !== 'none';
    const saidScam = Boolean(s && s.scam_type !== 'none');
    if (isScam && saidScam) tp++;
    else if (isScam) fn++;
    else if (saidScam) fp++;
    else tn++;
  });
  const answered = outcomes.filter((o) => o.signals).length;
  const extractor: AiRun['extractor'] = {
    messages: messages.length,
    answered,
    failed: messages.length - answered,
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, { ...v, accuracy: v.total ? v.correct / v.total : null }]),
    ),
    scamDetection: {
      precision: tp + fp ? tp / (tp + fp) : null,
      recall: tp + fn ? tp / (tp + fn) : null,
      falsePositiveRate: fp + tn ? fp / (fp + tn) : null,
    },
    medianLatencyMs: median(outcomes.filter((o) => o.signals).map((o) => o.latencyMs)),
  };
  console.log('\nExtractor (G1):');
  console.table(Object.fromEntries(Object.entries(extractor.fields).map(([k, v]) => [k, `${v.correct}/${v.total} ${pct(v.accuracy)}`])));
  if (mistakes.length) console.log(`Mistakes (${mistakes.length}):\n  ` + mistakes.slice(0, 40).join('\n  '));

  // ---------- 2. End to end: rules only vs rules + R8 ----------
  const { labelled, index } = await loadLabelledHistory(db);
  if (labelled.length === 0) {
    console.error('No labelled transactions. Run `npm run db:seed` first.');
    process.exit(1);
  }
  const notes = [...new Set(labelled.map((t) => t.note.trim()).filter(Boolean))];
  console.log(`\nAnalysing ${notes.length} distinct payment notes from the dataset...`);
  const noteOutcomes = await pool(notes, CONCURRENCY, (note) => withRetry(() => ai.analyze({ text: note })));
  const signalsByNote = new Map<string, ScamSignals>();
  notes.forEach((note, i) => {
    const s = noteOutcomes[i].signals;
    if (s) signalsByNote.set(note, s);
  });
  // Keys must match the raw note used during scoring.
  const rawSignals = new Map<string, ScamSignals>();
  for (const t of labelled) {
    const s = signalsByNote.get(t.note.trim());
    if (s) rawSignals.set(t.note, s);
  }
  const rulesOnly = evaluateDetection(labelled, index).metrics;
  const withAi = evaluateDetection(labelled, index, rawSignals).metrics;
  console.table({
    'rules only': { recall: pct(rulesOnly.recall), precision: pct(rulesOnly.precision), fpr: pct(rulesOnly.falsePositiveRate), tp: rulesOnly.truePositives, fp: rulesOnly.falsePositives },
    'rules + Gemini': { recall: pct(withAi.recall), precision: pct(withAi.precision), fpr: pct(withAi.falsePositiveRate), tp: withAi.truePositives, fp: withAi.falsePositives },
  });

  // ---------- 3. Grounding pass rate of the explainer ----------
  const { scored } = evaluateDetection(labelled, index, rawSignals);
  const flagged = labelled.filter((t) => scored.get(t.id)!.decision !== 'allow');
  // A fixed, spread-out sample so the run is repeatable and covers every scenario.
  const sample = flagged
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((_, i) => i % Math.max(1, Math.floor(flagged.length / 12)) === 0)
    .slice(0, 12);
  const jobs = sample.flatMap((t) => (['en', 'hi', 'bn'] as const).map((lang) => ({ t, lang })));
  const grounded = await pool(jobs, CONCURRENCY, async ({ t, lang }) => {
    const s = scored.get(t.id)!;
    const template = templateExplanation(s.fired, lang, {
      txnType: t.type === 'collect' ? 'collect' : 'pay',
      amountPaise: t.amountPaise,
      payeeName: 'the payee',
    });
    const out = await withRetry(() =>
      ai.explain({ lang, decision: s.decision, txnType: t.type === 'collect' ? 'collect' : 'pay', fired: s.fired, template }),
    );
    if (!out.candidate) return { answered: false, grounded: false };
    const ok = out.candidate.reasons.length === template.reasons.length && isGrounded(out.candidate, template);
    return { answered: true, grounded: ok };
  });
  const answeredG2 = grounded.filter((g) => g.answered).length;
  const groundedCount = grounded.filter((g) => g.grounded).length;
  const grounding = {
    attempted: jobs.length,
    answered: answeredG2,
    grounded: groundedCount,
    passRate: answeredG2 ? groundedCount / answeredG2 : null,
  };
  console.log(`\nGrounding (G2): ${groundedCount}/${answeredG2} answered explanations passed (${pct(grounding.passRate)})`);

  const run: AiRun = {
    generatedAt: new Date().toISOString(),
    models: { live: model },
    extractor,
    endToEnd: { notesAnalysed: notes.length, notesFailed: notes.length - signalsByNote.size, rulesOnly, withAi },
    grounding,
  };
  await db.insert(evalRuns).values({ kind: 'ai', results: run });
  const path = await writeEvalDoc(db);
  console.log(`\nSaved to the database and ${path}`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
