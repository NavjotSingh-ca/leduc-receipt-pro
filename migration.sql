-- ============================================================
-- Receipt Pro v4.0 — Supabase Migration
-- Run this in the Supabase SQL Editor (Montreal region)
-- ============================================================

-- ─── 1. Add Suite II columns to receipts ───
-- (Idempotent: uses IF NOT EXISTS pattern)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'paid_by'
  ) THEN
    ALTER TABLE receipts ADD COLUMN paid_by text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'reimbursement_status'
  ) THEN
    ALTER TABLE receipts ADD COLUMN reimbursement_status text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE receipts ADD COLUMN approval_status text DEFAULT 'submitted';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'needs_reimbursement'
  ) THEN
    ALTER TABLE receipts ADD COLUMN needs_reimbursement boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipts' AND column_name = 'duplicate_hash'
  ) THEN
    ALTER TABLE receipts ADD COLUMN duplicate_hash text DEFAULT NULL;
  END IF;
END $$;


-- ─── 2. Row Level Security (RLS) Policies ───
-- These enforce data isolation at the database level.
-- Employees can ONLY see their own data.

-- Enable RLS on receipts
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe re-run)
DROP POLICY IF EXISTS "Users can view own receipts" ON receipts;
DROP POLICY IF EXISTS "Users can insert own receipts" ON receipts;
DROP POLICY IF EXISTS "Users can update own receipts" ON receipts;
DROP POLICY IF EXISTS "Owners can view all receipts" ON receipts;

-- Policy: Users can always see their own receipts
CREATE POLICY "Users can view own receipts"
  ON receipts FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert receipts for themselves
CREATE POLICY "Users can insert own receipts"
  ON receipts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own receipts
CREATE POLICY "Users can update own receipts"
  ON receipts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- NOTE: For Owner/Accountant elevated access, you would need a
-- 'user_roles' table. Example pattern below:
--
-- CREATE TABLE IF NOT EXISTS user_roles (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
--   role text NOT NULL DEFAULT 'employee' CHECK (role IN ('owner','employee','accountant')),
--   created_at timestamptz DEFAULT now(),
--   UNIQUE(user_id)
-- );
--
-- ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
--
-- -- Then modify the SELECT policy:
-- CREATE POLICY "Elevated users can view all receipts"
--   ON receipts FOR SELECT
--   USING (
--     auth.uid() = user_id
--     OR EXISTS (
--       SELECT 1 FROM user_roles
--       WHERE user_roles.user_id = auth.uid()
--       AND user_roles.role IN ('owner', 'accountant')
--     )
--   );


-- ─── 3. Enable RLS on audit_logs ───

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Users can insert own audit logs" ON audit_logs;

CREATE POLICY "Users can view own audit logs"
  ON audit_logs FOR SELECT
  USING (auth.uid() = user_id::uuid);

CREATE POLICY "Users can insert own audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id::uuid);


-- ─── 4. Enable RLS on receipt_history ───

ALTER TABLE receipt_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own receipt history" ON receipt_history;
DROP POLICY IF EXISTS "Users can insert own receipt history" ON receipt_history;

CREATE POLICY "Users can view own receipt history"
  ON receipt_history FOR SELECT
  USING (auth.uid() = archived_by::uuid);

CREATE POLICY "Users can insert own receipt history"
  ON receipt_history FOR INSERT
  WITH CHECK (auth.uid() = archived_by::uuid);


-- ─── 5. Indexes for performance ───

CREATE INDEX IF NOT EXISTS idx_receipts_user_id ON receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_duplicate_hash ON receipts(duplicate_hash);
CREATE INDEX IF NOT EXISTS idx_receipts_integrity_hash ON receipts(integrity_hash);
CREATE INDEX IF NOT EXISTS idx_receipts_approval_status ON receipts(approval_status);
CREATE INDEX IF NOT EXISTS idx_receipts_paid_by ON receipts(paid_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
