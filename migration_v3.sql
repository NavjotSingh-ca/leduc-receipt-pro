-- ============================================================
-- OMEGA Overhaul Phase 3 — Security & Retention (migration_v3.sql)
-- RLS hardening + CRA 7-year retention lock
-- ============================================================

-- ─── 1. RLS Hardening: Block direct user_roles manipulation ───
-- Only SECURITY DEFINER RPCs (generate_access_code, redeem_access_code,
-- bootstrap_first_user_org) may write to user_roles.
-- This explicit deny-all policy makes the intent clear and prevents edge cases.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users_Cannot_Manage_Roles_Directly' AND tablename = 'user_roles'
  ) THEN
    CREATE POLICY "Users_Cannot_Manage_Roles_Directly" ON user_roles
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END $$;

-- ─── 2. CRA 7-Year Retention Lock ───
-- Prevents permanent deletion of approved receipts within the 7-year CRA window.
-- Soft-deleted receipts (is_deleted = true) can only be permanently removed if:
--   a) The transaction_date is older than 7 years, OR
--   b) The receipt was never approved

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Protect_CRA_Retention_Window' AND tablename = 'receipts'
  ) THEN
    CREATE POLICY "Protect_CRA_Retention_Window" ON receipts
      FOR DELETE USING (
        is_deleted = true AND (
          transaction_date::date < (now() - interval '7 years')::date
          OR approval_status != 'approved'
        )
      );
  END IF;
END $$;

-- ─── 3. Audit log retention — 10-year minimum ───
-- Prevent any deletion of audit_logs entries less than 10 years old
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Protect_Audit_Log_Retention' AND tablename = 'audit_logs'
  ) THEN
    CREATE POLICY "Protect_Audit_Log_Retention" ON audit_logs
      FOR DELETE USING (
        created_at::date < (now() - interval '10 years')::date
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
