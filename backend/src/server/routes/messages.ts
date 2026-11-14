import { Hono } from 'hono';
import { z } from 'zod';
import { getAi } from '@/lib/ai';
import { schemas } from '@/lib/api/schemas';
import { basicMessageCheck } from '@/lib/api/views';
import { reasonText } from '@/lib/risk/explain';
import { r8FromSignals } from '@/lib/risk/r8';
import { currentActor } from '../auth';
import { rateLimit, readJson } from '../http';

export const messageRoutes = new Hono();

/**
 * "Check this message": Gemini reads the text or screenshot (G1). Returns the
 * validated signals and the R8 points they WOULD add to a payment, from the
 * fixed table. Nothing is paid, blocked or stored as a decision.
 */
messageRoutes.post('/check-message', async (c) => {
  const input = await readJson(c, z.object({ userId: schemas.userId.optional(), lang: schemas.lang, message: schemas.message }).strict());
  const actor = await currentActor(c, input.userId);
  await rateLimit(c, 'ai', actor.userId);
  const ai = getAi();
  const basic = basicMessageCheck(input.message.text ?? '');
  if (!ai) return c.json({ aiStatus: 'disabled', signals: null, r8: null, reason: null, basic });
  const outcome = await ai.analyze(input.message);
  const r8 = r8FromSignals(outcome.signals);
  return c.json({
    aiStatus: outcome.status,
    model: outcome.model,
    latencyMs: outcome.latencyMs,
    signals: outcome.signals,
    r8: r8 ? { points: r8.points, facts: r8.facts } : { points: 0, facts: {} },
    reason: r8 ? reasonText(r8, input.lang) : null,
    basic,
  });
});
