import type { Metadata } from 'next';
import { QueryProvider } from '../lib/query-provider';
import { ThemeInitScript } from '../lib/theme-init-script';
import { ThemeSync } from '../lib/theme-sync';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bata POS - Admin',
  description: 'Bata Footwear store management console',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeInitScript />
      </head>
      <body>
        <ThemeSync />
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
