import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TeamFlow',
  description: 'TeamFlow foundation setup',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
