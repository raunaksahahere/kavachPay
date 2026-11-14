'use client';

import { useEffect } from 'react';

/** Registers the service worker that makes Kavach Pay installable as a PWA. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production' && !process.env.NEXT_PUBLIC_SW_IN_DEV) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Installability is an enhancement; the app works without it.
    });
  }, []);
  return null;
}
