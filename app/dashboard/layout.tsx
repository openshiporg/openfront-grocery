import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';

import { Toaster } from '@/components/ui/sonner';

import './globals.css';

export const dynamic = 'force-dynamic';

// Keep public auth/init routes free of a second database-backed GraphQL read.
// Store-specific identity is rendered after authentication by the dashboard
// shell; metadata must remain available even when the database pool is busy.
export const metadata: Metadata = {
  title: 'Openfront Grocery Operations',
  description: 'Operations dashboard for Openfront Grocery',
  applicationName: 'Openfront Grocery',
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <Toaster />
    </ThemeProvider>
  );
}
