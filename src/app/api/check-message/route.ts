import { z } from 'zod';
import { getAi } from '@/lib/ai';
import { handle, rateLimit, readJson, schemas } from '@/lib/api/http';
import { basicMessageCheck } from '@/lib/api/views';
import { reasonText } from '@/lib/risk/explain';
import { r8FromSignals } from '@/lib/risk/r8';

const body = z.object({ userId: schemas.userId, lang: schemas.lang, message: schemas.message }).strict();

/**
 * "Check this message": Gemini reads the text or screenshot (G1). The response
 * shows the validated signals and the R8 points they WOULD add to a payment,
 * computed by the fixed table. Nothing is paid, blocked or stored as a decision.
 */
export const POST = handle(async (req) => {
  const input = await readJson(req, body);
  await rateLimit(req, 'ai', input.userId);
  const ai = getAi();
  const basic = basicMessageCheck(input.message.text ?? '');

  if (!ai) {
    return Response.json({ aiStatus: 'disabled', signals: null, r8: null, reason: null, basic });
  }
  const outcome = await ai.analyze(input.message);
  const r8 = r8FromSignals(outcome.signals);
  return Response.json({
    aiStatus: outcome.status,
    model: outcome.model,
    latencyMs: outcome.latencyMs,
    signals: outcome.signals,
    r8: r8 ? { points: r8.points, facts: r8.facts } : { points: 0, facts: {} },
    reason: r8 ? reasonText(r8, input.lang) : null,
    basic,
  });
});
