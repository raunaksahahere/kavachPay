import { getDb } from '@/db/client';
import { dashboardStats } from '@/lib/analyst/queries';
import { handle } from '@/lib/api/http';

export const GET = handle(async () => Response.json(await dashboardStats(getDb())));
