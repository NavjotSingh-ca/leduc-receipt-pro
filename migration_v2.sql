-- ============================================================
-- OMEGA Overhaul Phase 2 — Database Patches (migration_v2.sql)
-- Non-destructive updates to resolve schema gaps and RLS issues.
-- ============================================================

-- ─── 1. Projects Table Fixes ───
-- Finding 1: Add missing user_id column
ALTER TABLE projects 
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Finding 5: Add missing RLS policies for projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Insert_Projects_Tenant" ON projects
  FOR INSERT WITH CHECK (org_id = get_user_org());

CREATE POLICY "Update_Projects_Tenant" ON projects
  FOR UPDATE USING (org_id = get_user_org())
  WITH CHECK (org_id = get_user_org());

CREATE POLICY "Delete_Projects_Tenant" ON projects
  FOR DELETE USING (org_id = get_user_org());

-- ─── 2. Receipts Table Fixes ───
-- Finding 2: Add missing ~14 columns to match application payload
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS transaction_time text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS source_file_name text,
  ADD COLUMN IF NOT EXISTS source_file_type text,
  ADD COLUMN IF NOT EXISTS blur_score numeric,
  ADD COLUMN IF NOT EXISTS capture_source text,
  ADD COLUMN IF NOT EXISTS usage_type text,
  ADD COLUMN IF NOT EXISTS business_use_percent numeric,
  ADD COLUMN IF NOT EXISTS job_code text,
  ADD COLUMN IF NOT EXISTS vehicle_id text,
  ADD COLUMN IF NOT EXISTS missing_bn_warning boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS high_audit_risk boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_for_audit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vendor_tax_number text;

-- Finding 7 & Addition: Auto-update updated_at on receipts
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_receipts_updated_at ON receipts;
CREATE TRIGGER trg_set_receipts_updated_at
BEFORE UPDATE ON receipts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 3. Receipt History Fixes ───
-- Finding 3: Add auto-org trigger to receipt_history to fix RLS violation on archival
CREATE OR REPLACE FUNCTION set_history_org_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := (SELECT org_id FROM user_roles WHERE user_id = NEW.user_id LIMIT 1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_history_org_id ON receipt_history;
CREATE TRIGGER trg_set_history_org_id
BEFORE INSERT ON receipt_history
FOR EACH ROW EXECUTE FUNCTION set_history_org_id();

-- ─── 4. Receipt Line Items Fixes ───
-- Finding 4: Add missing RLS policies for receipt_line_items
-- Assuming receipt_line_items has receipt_id, we might need an org_id or join.
-- Let's check if receipt_line_items has an org_id column. If not, we add it.
ALTER TABLE receipt_line_items 
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

-- Auto-org trigger for line items just in case
CREATE OR REPLACE FUNCTION set_line_item_org_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    -- Try to derive from the parent receipt if possible
    NEW.org_id := (SELECT org_id FROM receipts WHERE id = NEW.receipt_id LIMIT 1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_line_item_org_id ON receipt_line_items;
CREATE TRIGGER trg_set_line_item_org_id
BEFORE INSERT ON receipt_line_items
FOR EACH ROW EXECUTE FUNCTION set_line_item_org_id();

-- Apply RLS
CREATE POLICY "Select_Line_Items_Tenant" ON receipt_line_items
  FOR SELECT USING (org_id = get_user_org());

CREATE POLICY "Insert_Line_Items_Tenant" ON receipt_line_items
  FOR INSERT WITH CHECK (org_id = get_user_org());

CREATE POLICY "Update_Line_Items_Tenant" ON receipt_line_items
  FOR UPDATE USING (org_id = get_user_org());

CREATE POLICY "Delete_Line_Items_Tenant" ON receipt_line_items
  FOR DELETE USING (org_id = get_user_org());

-- ─── 5. User Roles Fixes ───
-- Finding 8: Drop UNIQUE(user_id) constraint to prevent lockout on role update/org change
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_key;

NOTIFY pgrst, 'reload schema';
