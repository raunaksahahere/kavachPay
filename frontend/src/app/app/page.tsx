import type { Metadata } from 'next';
import { UserApp } from '@/components/user-app';

export const metadata: Metadata = { title: 'Pay · Kavach Pay' };

export default function AppPage() {
  return <UserApp />;
}
