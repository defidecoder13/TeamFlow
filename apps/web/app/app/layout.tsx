import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TeamFlow',
  description: 'Your TeamFlow workspace.',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
