import { config } from 'dotenv';

// Scripts run outside Next.js, so load the same env files it would.
config({ path: ['.env.local', '.env'], quiet: true });
