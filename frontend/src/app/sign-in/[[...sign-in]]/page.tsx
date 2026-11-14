import { SignIn } from '@clerk/nextjs';
import { Suspense } from 'react';
import { AuthScreen } from '@/components/auth-screen';
import { Spinner } from '@/components/ui';

export default function SignInPage() {
  return (
    <AuthScreen>
      {/* Clerk reads the URL, so with Cache Components it renders inside Suspense. */}
      <Suspense fallback={<Spinner />}>
        <SignIn />
      </Suspense>
    </AuthScreen>
  );
}
