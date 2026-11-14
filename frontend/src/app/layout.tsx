import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata, Viewport } from 'next';
import { AuthEnabledProvider } from '@/components/auth-context';
import { RegisterServiceWorker } from '@/components/register-sw';
import { authEnabled } from '@/config/auth';
import './globals.css';
import './design-system.css';

export const metadata: Metadata = {
  title: 'Kavach Pay — Fraud Intelligence',
  description: 'A UPI-style payment experience with an intelligent fraud shield.',
  applicationName: 'Kavach Pay',
  appleWebApp: { capable: true, title: 'Kavach Pay', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#58698f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {/* Keep the existing authentication and service-worker behavior intact. */}
        {authEnabled() ? (
          <ClerkProvider>
            <AuthEnabledProvider enabled>{children}</AuthEnabledProvider>
          </ClerkProvider>
        ) : (
          <AuthEnabledProvider enabled={false}>{children}</AuthEnabledProvider>
        )}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
