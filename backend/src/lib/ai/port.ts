import type { Lang } from '@/config/app';
import type { Decision } from '@/config/risk';
import type { AiStatus, Explanation, FiredRule } from '@/lib/risk/types';
import type { ScamSignals } from './schema';

/**
 * The narrow doorway between the deterministic core and Gemini. The core
 * depends only on this interface, so it runs unchanged with `null` in its
 * place (rules-only mode) or with a fake in tests.
 */

export type AnalyzeInput = {
  /** Message text or collect note. Treated as untrusted data, never as instructions. */
  text?: string;
  image?: { mimeType: string; dataBase64: string };
};

export type AnalyzeOutcome = {
  status: AiStatus;
  /** Present only when the output passed schema validation. */
  signals: ScamSignals | null;
  latencyMs: number;
  model: string;
};

export type ExplainInput = {
  lang: Lang;
  decision: Decision;
  txnType: 'pay' | 'collect';
  fired: FiredRule[];
  /** The deterministic wording; the model may only rephrase this. */
  template: Explanation;
};

export type ExplainOutcome = {
  status: AiStatus;
  /** Candidate wording. The caller still runs the grounding check on it. */
  candidate: { headline: string; reasons: string[] } | null;
  latencyMs: number;
  model: string;
};

export interface AiPort {
  analyze(input: AnalyzeInput): Promise<AnalyzeOutcome>;
  explain(input: ExplainInput): Promise<ExplainOutcome>;
}
