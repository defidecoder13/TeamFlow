import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { AuthBrandPanel } from '../../../components/auth/AuthBrandPanel';
import { AuthLayout } from '../../../components/auth/AuthLayout';
import { ClerkReady } from '../../../components/auth/ClerkReady';
import { getSafeReturnTo } from '../../../lib/auth-guard';

export const metadata: Metadata = {
  title: 'Create account — TeamFlow',
  description: 'Create your TeamFlow account.',
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const returnTo = getSafeReturnTo(next ?? null) ?? undefined;

  return (
    <AuthLayout
      windowTitle="TeamFlow — Sign Up"
      brand={
        <AuthBrandPanel
          eyebrow="Build together"
          headline="A workspace for what's next."
          supporting="Create an account and join a better way to collaborate."
          footnote="Ideas don't work alone."
        />
      }
    >
      <div className="w-full min-w-0">
        <div className="flex justify-center">
          <ClerkReady label="Loading sign up">
            <SignUp
              forceRedirectUrl={returnTo}
              fallbackRedirectUrl="/app"
              signInUrl="/sign-in"
            />
          </ClerkReady>
        </div>
      </div>
    </AuthLayout>
  );
}
