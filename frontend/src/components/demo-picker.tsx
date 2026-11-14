'use client';

import { ArrowLeft, MonitorSmartphone, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DemoUser } from '@/components/phone/types';
import { InstallAppButton } from '@/components/install-app';
import { Button, Card, EmptyState, ShieldLogo, Spinner } from '@/components/ui';
import { api, reloadTo } from '@/lib/client/api';

/**
 * Demo account trial: pick a shared synthetic account, no sign-up needed.
 * Open it on two devices with two different accounts to show a request
 * travelling from one phone to the other.
 */
export function DemoPicker() {
  const [users, setUsers] = useState<DemoUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void api<{ users: DemoUser[] }>('/api/demo-users').then((r) => (r.ok ? setUsers(r.data.users) : setError(r.error.message)));
  }, []);

  async function choose(userId: string) {
    setBusy(userId);
    setError(null);
    const r = await api('/api/demo-session', { body: { userId } });
    if (r.ok) reloadTo('/');
    else {
      setBusy(null);
      setError(r.error.message);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 px-4 py-8">
      <div className="flex items-center gap-3">
        <ShieldLogo size={40} />
        <div>
          <h1 className="text-xl font-bold">Demo account trial</h1>
          <p className="text-sm text-muted-foreground">Shared synthetic accounts. No sign-up, no real money.</p>
        </div>
      </div>

      <Card className="flex gap-3 bg-accent-soft p-4 text-sm">
        <MonitorSmartphone className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <p className="font-semibold">Show it on two devices</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4">
            <li>
              Phone 1: choose <strong>Asha Devi</strong>.
            </li>
            <li>
              Phone 2: choose <strong>Refund Helpdesk</strong> (the scam account), tap <strong>Request</strong>, ask{' '}
              <code>asha@kavach</code> for ₹4,999 with the note “Refund for your order”.
            </li>
            <li>The request appears on phone 1 within seconds. Tap Approve: Kavach stops it and explains why.</li>
          </ol>
        </div>
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}
      {!users && !error && (
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      )}
      {users && users.length === 0 && <EmptyState title="No demo accounts" hint="Run npm run db:seed to create them." />}
      <div className="grid gap-3 sm:grid-cols-2">
        {users?.map((u) => (
          <Card key={u.userId} className="flex flex-col gap-2 p-4" data-testid="demo-account">
            <div className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{u.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{u.vpa}</p>
              </div>
            </div>
            {u.blurb && <p className="flex-1 text-sm text-muted-foreground">{u.blurb}</p>}
            <Button onClick={() => choose(u.userId)} loading={busy === u.userId} disabled={busy !== null}>
              Use this account
            </Button>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Demo accounts are shared by everyone trying the app and are reset whenever the demo data is reseeded. UPI PIN for every demo account:{' '}
        <strong className="font-mono">1234</strong>. To keep your own private account, sign in instead.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/sign-in" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
          <ArrowLeft className="h-4 w-4" /> Sign in with your own account
        </Link>
        <InstallAppButton className="ml-auto" compact />
      </div>
    </main>
  );
}
