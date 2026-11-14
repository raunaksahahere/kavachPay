'use client';

import { FlaskConical, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Lang } from '@/config/app';
import { InstallAppButton } from '@/components/install-app';
import { Onboarding } from '@/components/onboarding';
import { PhoneApp } from '@/components/phone/phone-app';
import type { DemoUser } from '@/components/phone/types';
import { TopBar } from '@/components/top-bar';
import { Badge, Button, EmptyState, Spinner } from '@/components/ui';
import { api, reloadTo } from '@/lib/client/api';

type Me = { userId: string; name: string; vpa: string; language: Lang };
type Session =
  | { mode: 'open' }
  | { mode: 'signed_out' }
  | { mode: 'clerk'; onboarded: true; user: Me }
  | { mode: 'clerk'; onboarded: false; suggested: { name: string; handle: string } }
  | { mode: 'demo'; user: Me; signedInWithClerk: boolean };

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
    // Storage may be blocked; the preference simply is not remembered.
  }
}

/**
 * The user app shell. Who you are decides what you see:
 * - signed in with Clerk: your own account only (set it up on first visit)
 * - demo trial: the shared synthetic account you picked, with "Exit demo"
 * - sign-in switched off (automated tests): a demo-user switcher
 */
export function UserApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const reload = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    void api<Session>('/api/session').then((r) => {
      if (!alive) return;
      if (!r.ok) return setError(r.error.message);
      if (r.data.mode === 'signed_out') {
        reloadTo('/sign-in');
        return;
      }
      setSession(r.data);
    });
    return () => {
      alive = false;
    };
  }, [reloads]);

  if (error) {
    return (
      <Shell>
        <div className="m-4 max-w-md">
          <EmptyState title="Could not load your account" hint={error} />
        </div>
      </Shell>
    );
  }
  if (!session || session.mode === 'signed_out') {
    return (
      <Shell>
        <Spinner className="mt-20" />
      </Shell>
    );
  }
  if (session.mode === 'open') return <OpenMode />;

  if (session.mode === 'clerk' && !session.onboarded) {
    return (
      <Shell>
        <Onboarding suggested={session.suggested} onDone={reload} />
      </Shell>
    );
  }

  const me = session.user;
  const demo = session.mode === 'demo';
  return (
    <Shell
      bar={
        demo ? (
          <>
            <Badge tone="warn" className="max-w-[10rem] truncate" data-testid="demo-badge" title={`Demo account: ${me.name}`}>
              <FlaskConical className="h-3 w-3 shrink-0" />
              <span className="sm:hidden">Demo</span>
              <span className="hidden truncate sm:inline">Demo: {me.name}</span>
            </Badge>
            <Link href="/demo" className="hidden text-sm font-medium text-accent hover:underline md:inline">
              Switch
            </Link>
            <ExitDemo />
          </>
        ) : null
      }
    >
      <OwnPhone key={me.userId} me={me} />
      <aside className="hidden max-w-xs space-y-3 rounded-lg border border-border bg-card p-4 text-sm lg:block">
        <div>
          <p className="font-semibold">{me.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{me.vpa}</p>
        </div>
        {demo ? (
          <p className="text-muted-foreground">
            Shared demo account (synthetic). UPI PIN <strong className="font-mono">1234</strong>. Open another demo account on a second device
            to send requests and payments between them.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Your own account. Share your UPI ID to receive payments and requests. Balances are simulated; no real money moves.
          </p>
        )}
        <InstallAppButton />
      </aside>
    </Shell>
  );
}

function Shell({ children, bar }: { children: React.ReactNode; bar?: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <TopBar active="app">{bar}</TopBar>
      <main className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-0 py-4 sm:px-4 lg:flex-row lg:items-start lg:justify-center">
        {children}
      </main>
    </div>
  );
}

function ExitDemo() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await fetch('/api/demo-session', { method: 'DELETE' }).catch(() => null);
        reloadTo('/');
      }}
      data-testid="exit-demo"
    >
      <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Exit demo</span>
    </Button>
  );
}

function OwnPhone({ me }: { me: Me }) {
  const [lang, setLang] = useState<Lang>(() => (readStored(`kavach.lang.${me.userId}`) as Lang | null) ?? me.language);
  return (
    <PhoneApp
      userId={me.userId}
      lang={lang}
      onLang={(l) => {
        setLang(l);
        store(`kavach.lang.${me.userId}`, l);
      }}
    />
  );
}

/** Sign-in switched off (automated tests): pick any demo user. */
function OpenMode() {
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
      const initial =
        res.data.users.find((u) => u.userId === saved) ?? res.data.users.find((u) => u.vpa === 'asha@kavach') ?? res.data.users[0];
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

  const current = users?.find((u) => u.userId === userId);
  return (
    <Shell
      bar={
        users && users.length > 0 ? (
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
        ) : null
      }
    >
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
      {userId && (
        <PhoneApp
          key={userId}
          userId={userId}
          lang={lang}
          onLang={(l) => {
            setLang(l);
            store(`kavach.lang.${userId}`, l);
          }}
        />
      )}
      {current?.blurb && (
        <aside className="hidden max-w-xs rounded-lg border border-border bg-card p-4 text-sm lg:block">
          <p className="font-semibold">{current.name}</p>
          <p className="mt-1 text-muted-foreground">{current.blurb}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Sign-in is switched off (test mode). UPI PIN for every demo account: <strong className="font-mono">1234</strong>.
          </p>
        </aside>
      )}
    </Shell>
  );
}
