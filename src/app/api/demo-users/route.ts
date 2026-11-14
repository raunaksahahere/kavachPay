import { getDb } from '@/db/client';
import { handle } from '@/lib/api/http';
import { listDemoUsers } from '@/lib/api/users';

export const GET = handle(async () => Response.json({ users: await listDemoUsers(getDb()) }));
