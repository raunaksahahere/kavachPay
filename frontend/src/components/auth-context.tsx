'use client';

import { UserButton } from '@clerk/nextjs';
import { createContext, Suspense, useContext, type ReactNode } from 'react';

const AuthEnabled = createContext(false);

export function AuthEnabledProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <AuthEnabled.Provider value={enabled}>{children}</AuthEnabled.Provider>;
}

/** Whether Clerk sign-in is configured for this deployment. */
export function useAuthEnabled(): boolean {
  return useContext(AuthEnabled);
}

/** The signed-in user's avatar menu (sign out, profile). Renders nothing when sign-in is off. */
export function AccountMenu() {
  const enabled = useContext(AuthEnabled);
  if (!enabled) return null;
  return (
    <Suspense fallback={<span className="inline-block h-7 w-7 rounded-full bg-muted" />}>
      <UserButton />
    </Suspense>
  );
}
