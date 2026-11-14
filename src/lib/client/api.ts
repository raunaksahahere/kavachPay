'use client';

export type ApiError = { code: string; message: string; [key: string]: unknown };
export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiError };

function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * JSON fetch helper. For money-moving calls pass `idempotent: true`: one key is
 * generated per call and reused on automatic retries after a network failure,
 * so a flaky connection can never debit twice.
 */
export async function api<T>(
  path: string,
  opts: { method?: 'GET' | 'POST'; body?: unknown; idempotent?: boolean; retries?: number } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotent) headers['Idempotency-Key'] = newKey();
  const attempts = (opts.retries ?? (opts.idempotent ? 2 : 0)) + 1;

  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(path, {
        method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, status: res.status, data: json as T };
      // 409 "in progress" on an idempotent retry: wait and ask again for the stored result.
      if (opts.idempotent && res.status === 409 && json?.error?.code === 'request_in_progress' && attempt < attempts + 2) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      return { ok: false, status: res.status, error: (json?.error as ApiError) ?? { code: 'http_error', message: res.statusText } };
    } catch {
      if (attempt >= attempts) {
        return { ok: false, status: 0, error: { code: 'network', message: 'No connection. Please try again.' } };
      }
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

export const rupees = (paise: number) => {
  const r = paise / 100;
  return '₹' + r.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 });
};

/** Parses a rupee string such as "4,999" or "4999.50" into paise. */
export function parseRupees(text: string): number | null {
  const clean = text.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export function timeAgo(iso: string | Date): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
