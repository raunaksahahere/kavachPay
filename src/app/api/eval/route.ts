import { getDb } from '@/db/client';
import { handle } from '@/lib/api/http';
import { latestRuns } from '@/lib/eval/doc';

export const GET = handle(async () => Response.json(await latestRuns(getDb())));
