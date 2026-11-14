CREATE TYPE "public"."txn_status" AS ENUM('initiated', 'risk_checked', 'held', 'confirmed', 'settled', 'failed', 'reversed');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"vpa" text NOT NULL,
	"kind" text DEFAULT 'user' NOT NULL,
	"balance_paise" bigint DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_balance_non_negative" CHECK ("accounts"."kind" = 'system' OR "accounts"."balance_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_cache" (
	"input_hash" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"output" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"input_hash" text NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"at" text NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"payload" text NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collect_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_account_id" uuid NOT NULL,
	"payer_account_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "collect_amount_positive" CHECK ("collect_requests"."amount_paise" > 0),
	CONSTRAINT "collect_distinct_parties" CHECK ("collect_requests"."requester_account_id" <> "collect_requests"."payer_account_id")
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"state" text DEFAULT 'in_progress' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"txn_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"kind" text DEFAULT 'transfer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_amount_non_zero" CHECK ("ledger_entries"."amount_paise" <> 0)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "risk_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"txn_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"rules_score" integer NOT NULL,
	"ai_points" integer DEFAULT 0 NOT NULL,
	"decision" text NOT NULL,
	"fired_rules" jsonb NOT NULL,
	"ai_status" text DEFAULT 'not_run' NOT NULL,
	"ai_signals" jsonb,
	"explanation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" "txn_status" DEFAULT 'initiated' NOT NULL,
	"payer_account_id" uuid NOT NULL,
	"payee_account_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"collect_request_id" uuid,
	"risk_score" integer,
	"risk_decision" text,
	"hold_until" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "txn_amount_positive" CHECK ("transactions"."amount_paise" > 0),
	CONSTRAINT "txn_distinct_parties" CHECK ("transactions"."payer_account_id" <> "transactions"."payee_account_id")
);
--> statement-breakpoint
CREATE TABLE "txn_labels" (
	"txn_id" uuid PRIMARY KEY NOT NULL,
	"is_fraud" boolean NOT NULL,
	"scenario" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"kind" text DEFAULT 'person' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"pin_hash" text NOT NULL,
	"failed_pin_attempts" integer DEFAULT 0 NOT NULL,
	"pin_locked_until" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"demo_blurb" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collect_requests" ADD CONSTRAINT "collect_requests_requester_account_id_accounts_id_fk" FOREIGN KEY ("requester_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collect_requests" ADD CONSTRAINT "collect_requests_payer_account_id_accounts_id_fk" FOREIGN KEY ("payer_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_txn_id_transactions_id_fk" FOREIGN KEY ("txn_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_txn_id_transactions_id_fk" FOREIGN KEY ("txn_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payer_account_id_accounts_id_fk" FOREIGN KEY ("payer_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payee_account_id_accounts_id_fk" FOREIGN KEY ("payee_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_collect_request_id_collect_requests_id_fk" FOREIGN KEY ("collect_request_id") REFERENCES "public"."collect_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn_labels" ADD CONSTRAINT "txn_labels_txn_id_transactions_id_fk" FOREIGN KEY ("txn_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_vpa_uq" ON "accounts" USING btree ("vpa");--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_calls_kind_idx" ON "ai_calls" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "collect_payer_idx" ON "collect_requests" USING btree ("payer_account_id","status");--> statement-breakpoint
CREATE INDEX "ledger_txn_idx" ON "ledger_entries" USING btree ("txn_id");--> statement-breakpoint
CREATE INDEX "ledger_account_idx" ON "ledger_entries" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_txn_uq" ON "risk_assessments" USING btree ("txn_id");--> statement-breakpoint
CREATE INDEX "txn_payer_idx" ON "transactions" USING btree ("payer_account_id","created_at");--> statement-breakpoint
CREATE INDEX "txn_payee_idx" ON "transactions" USING btree ("payee_account_id","created_at");--> statement-breakpoint
CREATE INDEX "txn_status_idx" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "txn_decision_idx" ON "transactions" USING btree ("risk_decision","created_at");