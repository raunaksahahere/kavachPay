import { getDb } from '@/db/client';
import { handle } from '@/lib/api/http';
import { listDemoUsers } from '@/lib/api/users';

/** Shared synthetic personas for the demo trial. Public: names and UPI IDs are synthetic. */
export const GET = handle(async () => Response.json({ users: await listDemoUsers(getDb()) }), { public: true });
