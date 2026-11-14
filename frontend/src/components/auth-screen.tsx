import { FlaskConical } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { InstallAppButton } from '@/components/install-app';
import { ShieldLogo } from '@/components/ui';

/** Shared frame for the sign-in and sign-up pages, with the demo trial and install buttons below. */
export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <ShieldLogo size={56} />
        <h1 className="text-2xl font-bold">Kavach Pay</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The fraud shield that speaks up before money leaves your account. A prototype on synthetic data: no real money or bank is involved.
        </p>
      </div>
      {children}
      <div className="flex w-full max-w-[25rem] flex-col gap-2">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>
        <Link
          href="/demo"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          data-testid="demo-trial"
        >
          <FlaskConical className="h-4 w-4" /> Demo account trial
        </Link>
        <InstallAppButton />
      </div>
    </main>
  );
}
