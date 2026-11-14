import { z } from 'zod';
import { getDb } from '@/db/client';
import { getTransport } from '@/lib/ai';
import { runCopilot } from '@/lib/ai/copilot';
import { handle, rateLimit, readJson } from '@/lib/api/http';

export const maxDuration = 120;

/** G3: multi-step investigation with read-only tools. Returns the answer and the full tool trace. */
export const POST = handle(async (req) => {
  const { question } = await readJson(req, z.object({ question: z.string().trim().min(3).max(1000) }).strict());
  await rateLimit(req, 'ai', 'analyst');
  return Response.json(await runCopilot(getDb(), getTransport(), question));
});
