'use client';

import { useEffect, useState } from 'react';
import type { Lang } from '@/config/app';
import { PhoneApp } from '@/components/phone/phone-app';
import type { DemoUser } from '@/components/phone/types';
import { TopBar } from '@/components/top-bar';
import { EmptyState, Spinner } from '@/components/ui';
import { api } from '@/lib/client/api';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be blocked; the selection simply is not remembered.
  }
}

/** Demo shell: the "switch demo user" dropdown (no login) around the phone app. */
export function UserApp() {
  const [users, setUsers] = useState<DemoUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    void api<{ users: DemoUser[] }>('/api/demo-users').then((res) => {
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setUsers(res.data.users);
      const saved = readStored('kavach.userId');
      const initial = res.data.users.find((u) => u.userId === saved) ?? res.data.users.find((u) => u.vpa === 'asha@kavach') ?? res.data.users[0];
      if (initial) {
        setUserId(initial.userId);
        setLang((readStored(`kavach.lang.${initial.userId}`) as Lang | null) ?? initial.language);
      }
    });
  }, []);

  function pickUser(id: string) {
    const u = users?.find((x) => x.userId === id);
    if (!u) return;
    setUserId(id);
    setLang((readStored(`kavach.lang.${id}`) as Lang | null) ?? u.language);
    store('kavach.userId', id);
  }

  function pickLang(l: Lang) {
    setLang(l);
    if (userId) store(`kavach.lang.${userId}`, l);
  }

  const current = users?.find((u) => u.userId === userId);

  return (
    <div className="min-h-dvh">
      <TopBar active="app">
        {users && users.length > 0 && (
          <label className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground md:inline">Demo user</span>
            <select
              className="h-9 min-w-0 max-w-[11rem] rounded-md border border-border bg-card px-2 text-sm"
              value={userId ?? ''}
              onChange={(e) => pickUser(e.target.value)}
              data-testid="user-switcher"
            >
              {users.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </TopBar>
      <main className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-0 py-4 sm:px-4 lg:flex-row lg:items-start lg:justify-center">
        {error && (
          <div className="m-4 max-w-md">
            <EmptyState title="Could not load demo users" hint={`${error} Is the database seeded? Run npm run db:seed.`} />
          </div>
        )}
        {!users && !error && <Spinner className="mt-20" />}
        {users && users.length === 0 && (
          <div className="m-4 max-w-md">
            <EmptyState title="No demo users yet" hint="Run npm run db:seed to create the synthetic dataset." />
          </div>
        )}
        {userId && <PhoneApp userId={userId} lang={lang} onLang={pickLang} />}
        {current?.blurb && (
          <aside className="hidden max-w-xs rounded-lg border border-border bg-card p-4 text-sm lg:block">
            <p className="font-semibold">{current.name}</p>
            <p className="mt-1 text-muted-foreground">{current.blurb}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              Synthetic demo account. UPI PIN for every demo account: <strong className="font-mono">1234</strong>. No real
              money or bank is involved.
            </p>
          </aside>
        )}
      </main>
    </div>
  );
}
