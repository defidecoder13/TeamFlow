import { SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { AuthBrandPanel } from '../../../components/auth/AuthBrandPanel';
import { AuthLayout } from '../../../components/auth/AuthLayout';
import { ClerkReady } from '../../../components/auth/ClerkReady';
import { getSafeReturnTo } from '../../../lib/auth-guard';

export const metadata: Metadata = {
  title: 'Sign in — TeamFlow',
  description: 'Sign in to your TeamFlow account.',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; next?: string }>;
}) {
  const { status, next } = await searchParams;
  const notice =
    status === 'account-created' ? 'Account created — sign in to continue.' : undefined;
  const returnTo = getSafeReturnTo(next ?? null) ?? undefined;

  return (
    <AuthLayout
      windowTitle="TeamFlow — Sign In"
      brand={
        <AuthBrandPanel
          eyebrow="A calmer way to work together"
          headline="Ideas, discussions and progress. All in one place."
          supporting="TeamFlow helps modern teams stay focused, aligned and moving forward without the noise."
        />
      }
    >
      <div className="w-full min-w-0">
        {notice ? (
          <p
            role="status"
            className="mb-5 rounded-lg border border-[#E2E1E1] bg-[#FAF9F8] px-3.5 py-3 text-[13px] leading-snug text-[#171A21]"
          >
            {notice}
          </p>
        ) : null}

        <div className="flex justify-center">
          <ClerkReady label="Loading sign in">
            <SignIn
              forceRedirectUrl={returnTo}
              fallbackRedirectUrl="/app"
              signUpUrl="/sign-up"
            />
          </ClerkReady>
        </div>
      </div>
    </AuthLayout>
  );
}
