import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Kavach Pay',
    short_name: 'Kavach Pay',
    description: 'UPI-style payments with a fraud shield that speaks up before money leaves your account.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f3f5f8',
    theme_color: '#0f2a4a',
    categories: ['finance', 'security'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Check a message', short_name: 'Check', url: '/?screen=check' },
      { name: 'Analyst dashboard', short_name: 'Analyst', url: '/analyst' },
    ],
  };
}
