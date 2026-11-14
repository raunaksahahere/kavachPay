import { SignUp } from '@clerk/nextjs';
import { Suspense } from 'react';
import { AuthScreen } from '@/components/auth-screen';
import { Spinner } from '@/components/ui';

export default function SignUpPage() {
  return (
    <AuthScreen>
      {/* Clerk reads the URL, so with Cache Components it renders inside Suspense. */}
      <Suspense fallback={<Spinner />}>
        <SignUp />
      </Suspense>
    </AuthScreen>
  );
}
