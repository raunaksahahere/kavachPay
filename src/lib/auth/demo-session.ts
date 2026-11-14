/**
 * Demo-trial sessions: a signed, expiring cookie that names one shared
 * synthetic persona. It lets someone try Kavach Pay (for example on two
 * devices at once) without creating a Clerk account. It never grants access
 * to a real signed-in user's account: the persona must be marked as a demo
 * persona in the database, which is checked on every request.
 *
 * Uses Web Crypto so the same code runs in the proxy and in route handlers.
 */

import { APP_CONFIG } from '@/config/app';

export const DEMO_COOKIE = 'kavach_demo';

const encoder = new TextEncoder();

function secret(): string | null {
  if (process.env.DEMO_SESSION_SECRET) return process.env.DEMO_SESSION_SECRET;
  // Fallback so a deployment works with just the Clerk keys; still a server-only secret.
  if (process.env.CLERK_SECRET_KEY) return `kavach-demo-session:${process.env.CLERK_SECRET_KEY}`;
  return null;
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function hmac(key: string, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, encoder.encode(data)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function demoSessionsAvailable(): boolean {
  return secret() !== null;
}

export async function signDemoSession(
  userId: string,
  now = Date.now(),
  secretOverride?: string,
): Promise<{ value: string; expires: Date }> {
  const key = secretOverride ?? secret();
  if (!key) throw new Error('Demo sessions need DEMO_SESSION_SECRET or CLERK_SECRET_KEY.');
  const expires = new Date(now + APP_CONFIG.demoSessionHours * 3_600_000);
  const payload = b64url(encoder.encode(JSON.stringify({ u: userId, e: expires.getTime() })));
  const sig = b64url(await hmac(key, payload));
  return { value: `${payload}.${sig}`, expires };
}

/** Returns the persona's user id if the cookie is authentic and unexpired, otherwise null. */
export async function verifyDemoSession(
  value: string | undefined | null,
  now = Date.now(),
  secretOverride?: string,
): Promise<{ userId: string } | null> {
  const key = secretOverride ?? secret();
  if (!key || !value) return null;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  try {
    const expected = await hmac(key, payload);
    if (!timingSafeEqual(expected, fromB64url(sig))) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { u?: unknown; e?: unknown };
    if (typeof data.u !== 'string' || typeof data.e !== 'number' || data.e <= now) return null;
    return { userId: data.u };
  } catch {
    return null;
  }
}
