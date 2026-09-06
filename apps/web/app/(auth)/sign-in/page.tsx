import type { Metadata } from 'next';
import { AuthBrandPanel } from '../../../components/auth/AuthBrandPanel';
import { AuthLayout } from '../../../components/auth/AuthLayout';
import { SignInForm } from '../../../components/auth/SignInForm';
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
      <SignInForm notice={notice} returnTo={getSafeReturnTo(next) ?? undefined} />
    </AuthLayout>
  );
}
