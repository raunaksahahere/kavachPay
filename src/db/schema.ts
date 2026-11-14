import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const txnStatus = pgEnum('txn_status', [
  'initiated',
  'risk_checked',
  'held',
  'confirmed',
  'settled',
  'failed',
  'reversed',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Set for real signed-in users: one Kavach account per Clerk user. Null for synthetic demo personas. */
  clerkUserId: text('clerk_user_id').unique(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  kind: text('kind').$type<'person' | 'merchant'>().notNull().default('person'),
  language: text('language').$type<'en' | 'hi' | 'bn'>().notNull().default('en'),
  pinHash: text('pin_hash').notNull(),
  failedPinAttempts: integer('failed_pin_attempts').notNull().default(0),
  pinLockedUntil: ts('pin_locked_until'),
  /** Shown in the "switch demo user" dropdown. */
  isDemo: boolean('is_demo').notNull().default(false),
  demoBlurb: text('demo_blurb'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    vpa: text('vpa').notNull(),
    /** 'system' is the funding account that mints opening balances. */
    kind: text('kind').$type<'user' | 'system'>().notNull().default('user'),
    balancePaise: bigint('balance_paise', { mode: 'number' }).notNull().default(0),
    openedAt: ts('opened_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('accounts_vpa_uq').on(t.vpa),
    index('accounts_user_idx').on(t.userId),
    // A customer balance can never go negative. Only the funding account may.
    check('accounts_balance_non_negative', sql`${t.kind} = 'system' OR ${t.balancePaise} >= 0`),
  ],
);

export const collectRequests = pgTable(
  'collect_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The account asking for money (it would be credited). */
    requesterAccountId: uuid('requester_account_id')
      .notNull()
      .references(() => accounts.id),
    /** The account being asked to pay (it would be debited). */
    payerAccountId: uuid('payer_account_id')
      .notNull()
      .references(() => accounts.id),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    note: text('note').notNull().default(''),
    status: text('status')
      .$type<'pending' | 'approved' | 'declined' | 'blocked'>()
      .notNull()
      .default('pending'),
    createdAt: ts('created_at').notNull().defaultNow(),
    respondedAt: ts('responded_at'),
  },
  (t) => [
    index('collect_payer_idx').on(t.payerAccountId, t.status),
    check('collect_amount_positive', sql`${t.amountPaise} > 0`),
    check('collect_distinct_parties', sql`${t.requesterAccountId} <> ${t.payerAccountId}`),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').$type<'pay' | 'collect' | 'funding'>().notNull(),
    status: txnStatus('status').notNull().default('initiated'),
    payerAccountId: uuid('payer_account_id')
      .notNull()
      .references(() => accounts.id),
    payeeAccountId: uuid('payee_account_id')
      .notNull()
      .references(() => accounts.id),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    note: text('note').notNull().default(''),
    collectRequestId: uuid('collect_request_id').references(() => collectRequests.id),
    riskScore: integer('risk_score'),
    riskDecision: text('risk_decision').$type<'allow' | 'warn' | 'hold'>(),
    holdUntil: ts('hold_until'),
    failureReason: text('failure_reason'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    settledAt: ts('settled_at'),
  },
  (t) => [
    index('txn_payer_idx').on(t.payerAccountId, t.createdAt),
    index('txn_payee_idx').on(t.payeeAccountId, t.createdAt),
    index('txn_status_idx').on(t.status),
    index('txn_decision_idx').on(t.riskDecision, t.createdAt),
    check('txn_amount_positive', sql`${t.amountPaise} > 0`),
    check('txn_distinct_parties', sql`${t.payerAccountId} <> ${t.payeeAccountId}`),
  ],
);

/** Signed entries: negative debits an account, positive credits it. Per transaction they sum to zero. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    txnId: uuid('txn_id')
      .notNull()
      .references(() => transactions.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    kind: text('kind').$type<'transfer' | 'reversal'>().notNull().default('transfer'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('ledger_txn_idx').on(t.txnId),
    index('ledger_account_idx').on(t.accountId, t.createdAt),
    check('ledger_amount_non_zero', sql`${t.amountPaise} <> 0`),
  ],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    state: text('state').$type<'in_progress' | 'completed'>().notNull().default('in_progress'),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.key] })],
);

export const riskAssessments = pgTable(
  'risk_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    txnId: uuid('txn_id')
      .notNull()
      .references(() => transactions.id),
    /** Final score, 0..100, after the capped AI contribution. */
    score: integer('score').notNull(),
    /** Score from deterministic rules R1..R7 only. */
    rulesScore: integer('rules_score').notNull(),
    /** Points added by R8, already capped. */
    aiPoints: integer('ai_points').notNull().default(0),
    decision: text('decision').$type<'allow' | 'warn' | 'hold'>().notNull(),
    firedRules: jsonb('fired_rules').notNull(),
    aiStatus: text('ai_status').notNull().default('not_run'),
    aiSignals: jsonb('ai_signals'),
    explanation: jsonb('explanation'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('risk_txn_uq').on(t.txnId)],
);

/** Ground truth for the synthetic dataset. Never read by the risk engine. */
export const txnLabels = pgTable('txn_labels', {
  txnId: uuid('txn_id')
    .primaryKey()
    .references(() => transactions.id),
  isFraud: boolean('is_fraud').notNull(),
  scenario: text('scenario').notNull(),
});

export const auditLog = pgTable('audit_log', {
  seq: bigserial('seq', { mode: 'number' }).primaryKey(),
  /** Stored as an ISO string so the hashed bytes are exactly the stored bytes. */
  at: text('at').notNull(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  /** Canonical JSON text of the payload, hashed as stored. */
  payload: text('payload').notNull(),
  prevHash: text('prev_hash').notNull(),
  hash: text('hash').notNull(),
});

export const aiCalls = pgTable(
  'ai_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<'g1_analyze' | 'g2_explain' | 'g3_copilot'>().notNull(),
    model: text('model').notNull(),
    status: text('status').notNull(),
    inputHash: text('input_hash').notNull(),
    latencyMs: integer('latency_ms').notNull().default(0),
    detail: jsonb('detail'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('ai_calls_kind_idx').on(t.kind, t.createdAt)],
);

export const aiCache = pgTable('ai_cache', {
  inputHash: text('input_hash').primaryKey(),
  kind: text('kind').notNull(),
  model: text('model').notNull(),
  output: jsonb('output').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: ts('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const evalRuns = pgTable('eval_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').$type<'rules' | 'ai'>().notNull(),
  results: jsonb('results').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type CollectRequest = typeof collectRequests.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type RiskAssessment = typeof riskAssessments.$inferSelect;
export type AuditRow = typeof auditLog.$inferSelect;
export type TxnStatus = (typeof txnStatus.enumValues)[number];
