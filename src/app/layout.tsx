import type { Metadata, Viewport } from 'next';
import { RegisterServiceWorker } from '@/components/register-sw';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kavach Pay',
  description: 'A UPI-style payment app with a fraud shield that speaks up before money leaves your account.',
  applicationName: 'Kavach Pay',
  appleWebApp: { capable: true, title: 'Kavach Pay', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f2a4a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
