-- ============================================================
-- 9 Star Labs Final Production Overhaul — Supabase Migration
-- Multi-Tenant OMEGA Schema
-- ============================================================

-- ─── 0. Reset Existing Schema ───
-- The user has authorized a fresh start to implement organization-level multi-tenancy.
DROP TABLE IF EXISTS access_codes CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS business_units CASCADE;
DROP TABLE IF EXISTS businessunits CASCADE;
DROP TABLE IF EXISTS receipt_history CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS receipt_line_items CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS receipts CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- ─── 0. Extensions ───
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── 1. Organization Engine (Multi-Tenancy) ───
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ─── 2. User Roles & Tenant Mapping ───
CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'Employee' CHECK (role IN ('Owner','Employee','Accountant')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id) -- A user belongs to one organization in this iteration
);

-- Helper RPC to securely get the current user's organization ID
CREATE OR REPLACE FUNCTION get_user_org()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT org_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ─── 3. Business Units & Projects ───
CREATE TABLE business_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  created_at timestamptz DEFAULT now()
);

-- ─── 4. The Receipts Vault ───
CREATE TABLE receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Core Metadata
  vendor_name text,
  vendor_address text,
  business_number text,
  vendor_tax_number text,
  
  -- Financials
  total_amount numeric DEFAULT 0,
  subtotal numeric,
  tax_amount numeric DEFAULT 0,
  pst_amount numeric,
  currency text DEFAULT 'CAD',
  exchange_rate numeric DEFAULT 1.0,
  cad_equivalent numeric,
  
  -- Logistics
  transaction_date text,
  payment_method text,
  card_last_four text,
  category text,
  notes text,
  document_type text,
  business_unit_id uuid REFERENCES business_units(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Media & Intelligence
  image_url text,
  confidence_score numeric,
  cra_readiness_score numeric,
  thermal_warning boolean DEFAULT false,
  
  -- Approval & Reimbursement
  paid_by text,
  reimbursement_status text DEFAULT 'pending',
  needs_reimbursement boolean DEFAULT false,
  approval_status text DEFAULT 'submitted',
  
  -- Fraud & Duplicates
  integrity_hash text,
  duplicate_hash text,
  duplicate_warning boolean DEFAULT false,
  math_mismatch_warning boolean DEFAULT false,
  fraud_suspicion boolean DEFAULT false,
  fraud_reason text,
  
  -- Rich Data
  line_items jsonb DEFAULT '[]'::jsonb,
  semantic_embedding vector(768),
  
  -- System
  is_deleted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE receipt_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
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

-- ─── 5. Tamper-Evident Ledger (Audit & History) ───
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  receipt_id uuid REFERENCES receipts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details text,
  previous_hash text,
  event_hash text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE receipt_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  receipt_id uuid REFERENCES receipts(id) ON DELETE CASCADE,
  vendor_name text,
  vendor_tax_number text,
  business_number text,
  transaction_date text,
  total_amount numeric,
  subtotal numeric,
  tax_amount numeric,
  pst_amount numeric,
  payment_method text,
  category text,
  notes text,
  document_type text,
  project_id uuid,
  exchange_rate numeric,
  cad_equivalent numeric,
  duplicate_hash text,
  integrity_hash text,
  archived_at timestamptz DEFAULT now(),
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ─── 6. Access Codes (Invites) ───
CREATE TABLE access_codes (
  code text PRIMARY KEY,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL,
  business_unit_id uuid REFERENCES business_units(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '7 days'
);

-- ─── 7. Row Level Security (MULTI-TENANT ENFORCEMENT) ───
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_codes ENABLE ROW LEVEL SECURITY;

-- Helper Function for RLS Role Checks
CREATE OR REPLACE FUNCTION has_elevated_role()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role IN ('Owner', 'Accountant')
  );
$$;

-- RLS: Organizations
CREATE POLICY "Users can view their own organization" ON organizations
  FOR SELECT USING (id = get_user_org());

-- RLS: User Roles
CREATE POLICY "Users view roles in their organization" ON user_roles
  FOR SELECT USING (org_id = get_user_org());

-- RLS: Business Units
CREATE POLICY "View Business Units by Org" ON business_units
  FOR SELECT USING (org_id = get_user_org());
CREATE POLICY "Insert Business Units by Org" ON business_units
  FOR ALL USING (org_id = get_user_org());

-- RLS: Projects
CREATE POLICY "View Projects by Org" ON projects
  FOR SELECT USING (org_id = get_user_org());

-- RLS: Receipts
-- Rule 1: Employees only see their own. Owners/Accountants see all in Org.
-- Rule 2: Exclude deleted by default unless they bypass it.
CREATE POLICY "Select_Receipts_Tenant" ON receipts
  FOR SELECT USING (
    org_id = get_user_org() AND
    is_deleted = false AND
    (user_id = auth.uid() OR has_elevated_role())
  );
CREATE POLICY "Insert_Receipts_Tenant" ON receipts
  FOR INSERT WITH CHECK (org_id = get_user_org() AND user_id = auth.uid());
CREATE POLICY "Update_Receipts_Tenant" ON receipts
  FOR UPDATE USING (
    org_id = get_user_org() AND
    (user_id = auth.uid() OR has_elevated_role())
  );

-- RLS: Audit Logs
CREATE POLICY "Select_Audit_Tenant" ON audit_logs
  FOR SELECT USING (org_id = get_user_org() AND (user_id = auth.uid() OR has_elevated_role()));
CREATE POLICY "Insert_Audit_Tenant" ON audit_logs
  FOR INSERT WITH CHECK (org_id = get_user_org() AND user_id = auth.uid());

-- RLS: History
CREATE POLICY "Select_History_Tenant" ON receipt_history
  FOR SELECT USING (org_id = get_user_org());
CREATE POLICY "Insert_History_Tenant" ON receipt_history
  FOR INSERT WITH CHECK (org_id = get_user_org());

-- RLS: Access Codes
CREATE POLICY "Select_Invites_Tenant" ON access_codes
  FOR SELECT USING (org_id = get_user_org());

-- ─── 8. Invites & Auth RPCs ───
CREATE OR REPLACE FUNCTION generate_access_code(p_created_by uuid, p_role text, p_bu_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code text;
  v_org_id uuid;
BEGIN
  -- Get the inviter's organization
  SELECT org_id INTO v_org_id FROM user_roles WHERE user_id = p_created_by;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Inviter does not belong to an organization.';
  END IF;

  v_code := lpad(floor(random() * 1000000)::text, 6, '0');
  
  INSERT INTO access_codes (code, org_id, role, business_unit_id, created_by)
  VALUES (v_code, v_org_id, p_role, p_bu_id, p_created_by);
  
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION redeem_access_code(p_code text, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_bu_id uuid;
  v_created_by uuid;
  v_org_id uuid;
BEGIN
  SELECT role, business_unit_id, created_by, org_id 
  INTO v_role, v_bu_id, v_created_by, v_org_id
  FROM access_codes
  WHERE code = p_code AND expires_at > now();
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired access code');
  END IF;
  
  INSERT INTO user_roles (user_id, org_id, role, invited_by)
  VALUES (p_user_id, v_org_id, v_role, v_created_by)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, org_id = EXCLUDED.org_id, invited_by = EXCLUDED.invited_by;
  
  DELETE FROM access_codes WHERE code = p_code;
  
  RETURN json_build_object('success', true, 'role', v_role);
END;
$$;

-- Helper to quickly bootstrap an org for the very first user
CREATE OR REPLACE FUNCTION bootstrap_first_user_org(p_user_id uuid, p_org_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = p_user_id) THEN
    RETURN; -- Already has a role/org
  END IF;
  
  INSERT INTO organizations (name) VALUES (p_org_name) RETURNING id INTO v_org_id;
  INSERT INTO user_roles (user_id, org_id, role) VALUES (p_user_id, v_org_id, 'Owner');
END;
$$;

-- ─── 9. Indexes ───
CREATE INDEX IF NOT EXISTS idx_receipts_org_id ON receipts(org_id);
CREATE INDEX IF NOT EXISTS idx_receipts_user_id ON receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_approval_status ON receipts(approval_status);
CREATE INDEX IF NOT EXISTS idx_audit_org_id ON audit_logs(org_id);

-- ─── 10. Semantic Search RPC (Tenant Scoped) ───
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
    receipts.org_id = get_user_org() AND
    receipts.semantic_embedding IS NOT NULL AND
    receipts.is_deleted = false AND
    (p_user_id IS NULL OR receipts.user_id = p_user_id OR has_elevated_role()) AND
    1 - (receipts.semantic_embedding <=> query_embedding) > match_threshold
  ORDER BY receipts.semantic_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

NOTIFY pgrst, 'reload schema';
