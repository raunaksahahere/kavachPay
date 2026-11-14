import { z } from 'zod';
import { getDb } from '@/db/client';
import { getTransactionDetail } from '@/lib/analyst/queries';
import { handle } from '@/lib/api/http';
import { notFound } from '@/lib/errors';

export const GET = handle(async (_req, ctx: RouteContext<'/api/analyst/txn/[id]'>) => {
  const { id } = await ctx.params;
  const detail = await getTransactionDetail(getDb(), z.string().uuid().parse(id));
  if (!detail) throw notFound('Transaction');
  return Response.json(detail);
});
