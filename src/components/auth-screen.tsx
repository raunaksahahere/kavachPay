import type { ReactNode } from 'react';
import { ShieldLogo } from '@/components/ui';

/** Shared frame for the sign-in and sign-up pages. */
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
    </main>
  );
}
