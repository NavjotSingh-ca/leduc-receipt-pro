-- ============================================================
-- Receipt Pro v5.0 Masterpiece — Supabase Migration
-- Run this in the Supabase SQL Editor
-- ============================================================

-- ─── 0. Extensions ───
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── 1. Core Schema Updates to receipts ───
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'paid_by') THEN
    ALTER TABLE receipts ADD COLUMN paid_by text DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'reimbursement_status') THEN
    ALTER TABLE receipts ADD COLUMN reimbursement_status text DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'approval_status') THEN
    ALTER TABLE receipts ADD COLUMN approval_status text DEFAULT 'submitted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'needs_reimbursement') THEN
    ALTER TABLE receipts ADD COLUMN needs_reimbursement boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'duplicate_hash') THEN
    ALTER TABLE receipts ADD COLUMN duplicate_hash text DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'semantic_embedding') THEN
    ALTER TABLE receipts ADD COLUMN semantic_embedding vector(768);
  END IF;
END $$;

-- ─── 2. User Roles (RBAC) ───
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'Employee' CHECK (role IN ('Owner','Employee','Accountant')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- ─── 3. Receipt Line Items (Deep Storage) ───
CREATE TABLE IF NOT EXISTS receipt_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid REFERENCES receipts(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric DEFAULT 1,
  unit_price numeric DEFAULT 0,
  tax_rate numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  line_total numeric DEFAULT 0,
  category text,
  created_at timestamptz DEFAULT now()
);

-- ─── 4. Tamper-Evident Audit Logs (Merkle Hash Chain) ───
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'previous_hash') THEN
    ALTER TABLE audit_logs ADD COLUMN previous_hash text DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'event_hash') THEN
    ALTER TABLE audit_logs ADD COLUMN event_hash text DEFAULT NULL;
  END IF;
END $$;

-- ─── 5. Row Level Security (RLS) ───
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_history ENABLE ROW LEVEL SECURITY;

-- Helper Function for RLS (Security Definer avoids recursion)
CREATE OR REPLACE FUNCTION has_elevated_role()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role IN ('Owner', 'Accountant')
  );
END;
$$;

-- Receipts RLS
DROP POLICY IF EXISTS "Role_Based_Select_Receipts" ON receipts;
DROP POLICY IF EXISTS "Users can view own receipts" ON receipts;
CREATE POLICY "Role_Based_Select_Receipts"
  ON receipts FOR SELECT
  USING (
    auth.uid() = user_id OR has_elevated_role()
  );

DROP POLICY IF EXISTS "Insert_Own_Receipts" ON receipts;
DROP POLICY IF EXISTS "Users can insert own receipts" ON receipts;
CREATE POLICY "Insert_Own_Receipts"
  ON receipts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Update_Own_Receipts" ON receipts;
DROP POLICY IF EXISTS "Users can update own receipts" ON receipts;
CREATE POLICY "Update_Own_Receipts"
  ON receipts FOR UPDATE
  USING (auth.uid() = user_id OR has_elevated_role());

-- Users Roles RLS
DROP POLICY IF EXISTS "View_Own_Role" ON user_roles;
CREATE POLICY "View_Own_Role" ON user_roles FOR SELECT USING (auth.uid() = user_id OR has_elevated_role());

-- Audit Logs RLS
DROP POLICY IF EXISTS "Role_Based_View_Audit" ON audit_logs;
DROP POLICY IF EXISTS "Users can view own audit logs" ON audit_logs;
CREATE POLICY "Role_Based_View_Audit" ON audit_logs FOR SELECT USING (
  auth.uid() = user_id::uuid OR has_elevated_role()
);

DROP POLICY IF EXISTS "Insert_Own_Audit" ON audit_logs;
DROP POLICY IF EXISTS "Users can insert own audit logs" ON audit_logs;
CREATE POLICY "Insert_Own_Audit" ON audit_logs FOR INSERT WITH CHECK (auth.uid() = user_id::uuid);

-- ─── 6. Indexes ───
CREATE INDEX IF NOT EXISTS idx_receipts_user_id ON receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_duplicate_hash ON receipts(duplicate_hash);
CREATE INDEX IF NOT EXISTS idx_receipts_integrity_hash ON receipts(integrity_hash);
CREATE INDEX IF NOT EXISTS idx_receipts_approval_status ON receipts(approval_status);
CREATE INDEX IF NOT EXISTS idx_receipts_paid_by ON receipts(paid_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
-- Semantic search index (requires hnsw or ivfflat)
CREATE INDEX IF NOT EXISTS idx_receipts_semantic ON receipts USING hnsw (semantic_embedding vector_l2_ops);

-- ─── 7. Semantic Search RPC ───
CREATE OR REPLACE FUNCTION match_receipts (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    receipts.id,
    1 - (receipts.semantic_embedding <=> query_embedding) AS similarity
  FROM receipts
  WHERE 
    receipts.semantic_embedding IS NOT NULL AND
    (p_user_id IS NULL OR receipts.user_id = p_user_id) AND
    1 - (receipts.semantic_embedding <=> query_embedding) > match_threshold
  ORDER BY receipts.semantic_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─── 8. Missing Tables ───
CREATE TABLE IF NOT EXISTS businessunits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipt_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid REFERENCES receipts(id) ON DELETE CASCADE,
  vendor_name text,
  transaction_date date,
  total_amount numeric,
  category text,
  notes text,
  duplicate_hash text,
  integrity_hash text,
  archived_at timestamptz DEFAULT now(),
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE businessunits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Role_Based_Select_BU" ON businessunits;
CREATE POLICY "Role_Based_Select_BU" ON businessunits FOR SELECT USING (
  auth.uid() = user_id OR has_elevated_role()
);
