import type { Metadata } from 'next';
import { DemoPicker } from '@/components/demo-picker';

export const metadata: Metadata = { title: 'Demo account trial · Kavach Pay' };

export default function DemoPage() {
  return <DemoPicker />;
}
