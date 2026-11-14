import { GoogleGenAI } from '@google/genai';

/**
 * The only place that talks to Google. Everything above this file works with
 * plain objects, so tests replace the transport and never touch the network.
 *
 * Uses the Interactions API (the interface Google recommends for new projects)
 * with `store: false` on every call, so nothing is retained server-side.
 */

export type InteractionRequest = {
  model: string;
  system_instruction: string;
  input: unknown;
  response_format?: unknown;
  tools?: unknown[];
  generation_config?: Record<string, unknown>;
};

export type InteractionStep = { type: string; [key: string]: unknown };

export type InteractionResult = {
  output_text?: string;
  steps: InteractionStep[];
  status?: string;
};

export type Transport = (request: InteractionRequest, timeoutMs: number) => Promise<InteractionResult>;

export class AiTimeoutError extends Error {
  constructor(ms: number) {
    super(`AI call exceeded ${ms} ms`);
    this.name = 'AiTimeoutError';
  }
}

/** Rejects after `ms`, whatever the underlying call is doing. */
export function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiTimeoutError(ms));
    }, ms);
  });
  return Promise.race([work(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

export function createGeminiTransport(apiKey: string): Transport {
  const client = new GoogleGenAI({ apiKey });
  return (request, timeoutMs) =>
    withTimeout(async (signal) => {
      const interaction = await client.interactions.create(
        // The SDK's request type is a large generated union; our request is a
        // strict subset of it and is validated by the API.
        { ...request, store: false } as never,
        { timeout_ms: timeoutMs, signal } as never,
      );
      const result = interaction as unknown as InteractionResult;
      return { output_text: result.output_text, steps: result.steps ?? [], status: result.status };
    }, timeoutMs);
}

/** Maps a thrown error to the status we record for the call. */
export function statusForError(err: unknown): 'timeout' | 'blocked' | 'error' {
  if (err instanceof AiTimeoutError) return 'timeout';
  const e = err as { name?: string; message?: string; status?: number; statusCode?: number };
  const text = `${e?.name ?? ''} ${e?.message ?? ''}`.toLowerCase();
  if (text.includes('timeout') || text.includes('abort')) return 'timeout';
  if (text.includes('input blocked') || text.includes('safety') || text.includes('prohibited')) return 'blocked';
  return 'error';
}
