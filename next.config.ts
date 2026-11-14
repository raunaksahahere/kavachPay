import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The end-to-end tests build into their own folder so they can run beside a dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  cacheComponents: true,
  partialPrefetching: true,
  // Native argon2 binding must be loaded by Node, not bundled.
  serverExternalPackages: ['@node-rs/argon2'],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
