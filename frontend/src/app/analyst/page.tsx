import type { Metadata } from 'next';
import { AnalystDashboard } from '@/components/analyst/dashboard';

export const metadata: Metadata = { title: 'Analyst dashboard · Kavach Pay' };

export default function AnalystPage() {
  return <AnalystDashboard />;
}
