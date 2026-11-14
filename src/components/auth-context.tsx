'use client';

import { UserButton } from '@clerk/nextjs';
import { createContext, useContext, type ReactNode } from 'react';

const AuthEnabled = createContext(false);

export function AuthEnabledProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <AuthEnabled.Provider value={enabled}>{children}</AuthEnabled.Provider>;
}

/** The signed-in user's avatar menu (sign out, profile). Renders nothing when sign-in is off. */
export function AccountMenu() {
  const enabled = useContext(AuthEnabled);
  if (!enabled) return null;
  return <UserButton />;
}
