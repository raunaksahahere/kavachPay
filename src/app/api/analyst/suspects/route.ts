import { getDb } from '@/db/client';
import { listSuspiciousPayees } from '@/lib/analyst/queries';
import { handle } from '@/lib/api/http';

export const GET = handle(async () => Response.json({ items: await listSuspiciousPayees(getDb()) }));
