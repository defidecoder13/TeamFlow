import type { Metadata } from 'next';
import { AuthBrandPanel } from '../../../components/auth/AuthBrandPanel';
import { AuthLayout } from '../../../components/auth/AuthLayout';
import { SignUpForm } from '../../../components/auth/SignUpForm';

export const metadata: Metadata = {
  title: 'Create account — TeamFlow',
  description: 'Create your TeamFlow account.',
};

export default function SignUpPage() {
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
      <SignUpForm />
    </AuthLayout>
  );
}
