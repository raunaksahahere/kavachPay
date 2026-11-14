'use client';

import { LayoutDashboard, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AccountMenu } from '@/components/auth-context';
import { Badge, ShieldLogo, cn } from '@/components/ui';
import { api } from '@/lib/client/api';

type Status = { database: string; ai: { enabled: boolean; reason: string; cache: boolean } };

export function AiStatusBadge() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    void api<Status>('/api/status').then((r) => r.ok && setStatus(r.data));
  }, []);
  if (!status) return null;
  if (status.database !== 'ok') return <Badge tone="danger">Database unavailable</Badge>;
  return status.ai.enabled ? (
    <Badge tone="accent" data-testid="ai-mode">
      Gemini on{status.ai.cache ? ' · demo cache' : ''}
    </Badge>
  ) : (
    <Badge tone="warn" data-testid="ai-mode">
      Rules only (AI off)
    </Badge>
  );
}

export function TopBar({ active, children }: { active: 'app' | 'analyst'; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <ShieldLogo size={26} />
          <span className="hidden sm:inline">Kavach Pay</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {[
            { href: '/app', key: 'app', label: 'User app', Icon: Smartphone },
            { href: '/analyst', key: 'analyst', label: 'Analyst', Icon: LayoutDashboard },
          ].map((n) => (
            <Link
              key={n.key}
              href={n.href}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium',
                active === n.key ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <n.Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {children}
          <AiStatusBadge />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
