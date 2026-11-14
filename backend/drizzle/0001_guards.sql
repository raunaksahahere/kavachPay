-- Database-level guards that hold even if application code has a bug.

-- 1. Every transaction's ledger entries must sum to zero. Checked at COMMIT,
--    so a transaction can insert its debit and credit rows in any order.
CREATE OR REPLACE FUNCTION ledger_entries_zero_sum() RETURNS trigger AS $$
DECLARE
  total bigint;
BEGIN
  SELECT COALESCE(SUM(amount_paise), 0) INTO total
  FROM ledger_entries
  WHERE txn_id = NEW.txn_id;
  IF total <> 0 THEN
    RAISE EXCEPTION 'ledger entries for transaction % sum to %, expected 0', NEW.txn_id, total
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_zero_sum
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_zero_sum();
--> statement-breakpoint

-- 2. Ledger entries and audit rows are append-only: no UPDATE, no DELETE.
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
