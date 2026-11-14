import { createHash } from 'node:crypto';
import { asc, desc, sql } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '@/db/client';
import { auditLog, type AuditRow } from '@/db/schema';

/** prev_hash of the very first row. */
export const GENESIS_HASH = '0'.repeat(64);

/** Arbitrary constant identifying the audit chain's advisory lock. */
const AUDIT_LOCK_ID = 7_265_001;

export type AuditEvent = {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
};

/** JSON with object keys sorted, so equal values always serialise to equal bytes. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k]))
      .join(',') +
    '}'
  );
}

type HashedFields = Pick<
  AuditRow,
  'prevHash' | 'at' | 'actor' | 'action' | 'entityType' | 'entityId' | 'payload'
>;

/** Hash of a row: commits to its own content and to the previous row's hash. */
export function hashAuditRow(row: HashedFields): string {
  const material = JSON.stringify([
    row.prevHash,
    row.at,
    row.actor,
    row.action,
    row.entityType,
    row.entityId,
    row.payload,
  ]);
  return createHash('sha256').update(material).digest('hex');
}

/**
 * Appends one event to the chain. Must run inside a database transaction:
 * the advisory lock serialises appenders until that transaction ends, so two
 * writers can never both chain onto the same previous row.
 *
 * Callers take this lock LAST, after any row locks, to keep lock order fixed.
 */
export async function appendAudit(tx: Tx, event: AuditEvent, at: Date = new Date()): Promise<AuditRow> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_ID})`);
  const [last] = await tx
    .select({ hash: auditLog.hash })
    .from(auditLog)
    .orderBy(desc(auditLog.seq))
    .limit(1);

  const fields: HashedFields = {
    prevHash: last?.hash ?? GENESIS_HASH,
    at: at.toISOString(),
    actor: event.actor,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    payload: canonicalJson(event.payload ?? {}),
  };
  const [row] = await tx
    .insert(auditLog)
    .values({ ...fields, hash: hashAuditRow(fields) })
    .returning();
  return row;
}

/** Convenience for callers that are not already inside a transaction. */
export async function appendAuditStandalone(db: Db, event: AuditEvent): Promise<AuditRow> {
  return db.transaction((tx) => appendAudit(tx, event));
}

export type ChainVerification =
  | { ok: true; count: number; headHash: string }
  | {
      ok: false;
      count: number;
      /** seq of the first row that fails verification. */
      brokenAtSeq: number;
      reason: 'content_changed' | 'link_broken';
      detail: string;
    };

/**
 * Recomputes every hash from the first row. A row fails if its stored hash no
 * longer matches its content, or if it does not link to the row before it.
 */
export async function verifyChain(db: DbOrTx): Promise<ChainVerification> {
  const rows = await db.select().from(auditLog).orderBy(asc(auditLog.seq));
  let prev = GENESIS_HASH;
  for (const row of rows) {
    if (row.prevHash !== prev) {
      return {
        ok: false,
        count: rows.length,
        brokenAtSeq: row.seq,
        reason: 'link_broken',
        detail: `Row ${row.seq} does not link to the row before it (a row was removed, inserted or reordered).`,
      };
    }
    if (hashAuditRow(row) !== row.hash) {
      return {
        ok: false,
        count: rows.length,
        brokenAtSeq: row.seq,
        reason: 'content_changed',
        detail: `Row ${row.seq} was modified after it was written: its content no longer matches its hash.`,
      };
    }
    prev = row.hash;
  }
  return { ok: true, count: rows.length, headHash: prev };
}
