import { z } from 'zod';
import { getDb } from '@/db/client';
import { createOwnAccount, HANDLE_PATTERN } from '@/lib/accounts/onboard';
import { handle, rateLimit, readJson, schemas, sessionFacts } from '@/lib/api/http';
import { AppError } from '@/lib/errors';

const body = z
  .object({
    name: z.string().trim().min(1).max(80),
    handle: z
      .string()
      .trim()
      .toLowerCase()
      .regex(HANDLE_PATTERN, 'Use 3 to 30 letters, numbers, dot, dash or underscore'),
    pin: schemas.pin,
    language: schemas.lang,
  })
  .strict();

/** Creates the signed-in user's own account (once). Demo-trial sessions cannot do this. */
export const POST = handle(async (req) => {
  const input = await readJson(req, body);
  const { clerkUserId } = await sessionFacts();
  if (!clerkUserId) throw new AppError(401, 'clerk_required', 'Sign in to create your own account.');
  await rateLimit(req, 'pin', clerkUserId);
  const own = await createOwnAccount(getDb(), { clerkUserId, ...input });
  return Response.json({ user: own }, { status: 201 });
});
