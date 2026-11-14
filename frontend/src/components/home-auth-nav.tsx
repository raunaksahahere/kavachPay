'use client';

import { UserButton, useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { Suspense } from 'react';
import { useAuthEnabled } from '@/components/auth-context';

function SignedOutLinks() {
  return (
    <>
      <Link href="/sign-in" className="kavach-home-nav__link" data-testid="nav-sign-in">
        Sign in
      </Link>
      <Link href="/sign-up" className="kavach-home-nav__cta" data-testid="nav-sign-up">
        Sign up
      </Link>
    </>
  );
}

function ClerkAwareLinks() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) {
    return (
      <>
        <Link href="/app" className="kavach-home-nav__cta">
          Open app
        </Link>
        <UserButton />
      </>
    );
  }
  return <SignedOutLinks />;
}

/** Sign in / Sign up in the homepage nav; swaps to "Open app" + account menu once signed in. */
export function HomeAuthNav() {
  const enabled = useAuthEnabled();
  if (!enabled) {
    return (
      <Link href="/app" className="kavach-home-nav__cta">
        Open app
      </Link>
    );
  }
  return (
    <Suspense fallback={<SignedOutLinks />}>
      <ClerkAwareLinks />
    </Suspense>
  );
}
