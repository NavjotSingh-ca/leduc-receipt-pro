-- ============================================================
-- OMEGA-X Phase 5 — Final Database Extensions (migration_v4.sql)
-- Additive extension of the schema for Pagination, Orgs, and Settings
-- ============================================================

-- ─── 1. Organization Settings table ───

CREATE TABLE IF NOT EXISTS organization_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  business_name text,
  business_number text, -- CRA BN for the org
  address text,
  province text DEFAULT 'AB',
  gst_registrant boolean DEFAULT true,
  fiscal_year_end text DEFAULT '12-31', -- MM-DD
  default_currency text DEFAULT 'CAD',
  logo_url text,
  high_value_threshold numeric DEFAULT 500.00,
  require_vehicle_id_for_fuel boolean DEFAULT true,
  require_approval_above numeric DEFAULT 500.00,
  slack_webhook_url text,
  -- Accounting Integration Tokens
  qbo_refresh_token text,
  qbo_realm_id text,
  xero_refresh_token text,
  xero_tenant_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'organization_settings' AND policyname = 'Select_OrgSettings'
  ) THEN
    CREATE POLICY "Select_OrgSettings" ON organization_settings
      FOR SELECT USING (org_id = get_user_org());
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'organization_settings' AND policyname = 'Manage_OrgSettings_Owner'
  ) THEN
    CREATE POLICY "Manage_OrgSettings_Owner" ON organization_settings
      FOR ALL USING (org_id = get_user_org() AND has_elevated_role())
      WITH CHECK (org_id = get_user_org() AND has_elevated_role());
  END IF;
END $$;

-- Backfill default settings for existing orgs
INSERT INTO organization_settings (org_id)
SELECT id FROM organizations
WHERE id NOT IN (SELECT org_id FROM organization_settings WHERE org_id IS NOT NULL)
ON CONFLICT DO NOTHING;

-- ─── 2. Subscription / Plan table ───

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
  receipt_limit integer DEFAULT 50,
  user_limit integer DEFAULT 1,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Select_Sub_Tenant'
  ) THEN
    CREATE POLICY "Select_Sub_Tenant" ON subscriptions
      FOR SELECT USING (org_id = get_user_org());
  END IF;
END $$;

-- Backfill free plan for existing orgs
INSERT INTO subscriptions (org_id, plan)
SELECT id, 'free' FROM organizations
WHERE id NOT IN (SELECT org_id FROM subscriptions WHERE org_id IS NOT NULL)
ON CONFLICT DO NOTHING;

-- ─── 3. Paginated receipts RPC ───

CREATE OR REPLACE FUNCTION get_receipts_paginated(
  p_org_id uuid,
  p_user_id uuid,
  p_role text,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_category text DEFAULT NULL,
  p_from_date text DEFAULT NULL,
  p_to_date text DEFAULT NULL,
  p_approval_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  receipt json,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_where text := 'WHERE r.org_id = $1 AND r.is_deleted = false';
  v_total bigint;
BEGIN
  IF p_role = 'Employee' THEN
    v_where := v_where || ' AND r.user_id = $2';
  END IF;
  IF p_category IS NOT NULL THEN
    v_where := v_where || format(' AND r.category = %L', p_category);
  END IF;
  IF p_from_date IS NOT NULL THEN
    v_where := v_where || format(' AND r.transaction_date >= %L', p_from_date);
  END IF;
  IF p_to_date IS NOT NULL THEN
    v_where := v_where || format(' AND r.transaction_date <= %L', p_to_date);
  END IF;
  IF p_approval_status IS NOT NULL THEN
    v_where := v_where || format(' AND r.approval_status = %L', p_approval_status);
  END IF;
  IF p_search IS NOT NULL THEN
    v_where := v_where || format(
      ' AND (to_tsvector(''english'', coalesce(r.vendor_name, '''')) @@ plainto_tsquery(''english'', %L) OR r.vendor_name ILIKE %L)',
      p_search, '%' || p_search || '%'
    );
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT row_to_json(r)::json, COUNT(*) OVER() FROM receipts r %s ORDER BY r.created_at DESC LIMIT %s OFFSET %s',
    v_where, p_limit, p_offset
  ) USING p_org_id, p_user_id;
END;
$$;

-- ─── 4. GST/ITC Summary RPC for tax reporting ───

CREATE OR REPLACE FUNCTION get_itc_summary(
  p_from_date text,
  p_to_date text
)
RETURNS TABLE (
  category text,
  receipt_count bigint,
  total_subtotal numeric,
  total_gst numeric,
  total_pst numeric,
  total_amount numeric,
  recoverable_gst numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.category,
    COUNT(*)::bigint,
    ROUND(SUM(COALESCE(r.subtotal, 0))::numeric, 2),
    ROUND(SUM(COALESCE(r.tax_amount, 0))::numeric, 2),
    ROUND(SUM(COALESCE(r.pst_amount, 0))::numeric, 2),
    ROUND(SUM(r.total_amount)::numeric, 2),
    ROUND(SUM(
      COALESCE(r.tax_amount, 0) * COALESCE(r.business_use_percent, 100) / 100.0
    )::numeric, 2) AS recoverable_gst
  FROM receipts r
  WHERE
    r.org_id = get_user_org()
    AND r.is_deleted = false
    AND r.approval_status = 'approved'
    AND (p_from_date IS NULL OR r.transaction_date >= p_from_date)
    AND (p_to_date IS NULL OR r.transaction_date <= p_to_date)
  GROUP BY r.category
  ORDER BY total_amount DESC;
END;
$$;

-- ─── 5. Dashboard Stats RPC (Single row totals) ───

CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_org_id uuid,
  p_user_id uuid,
  p_role text
)
RETURNS TABLE (
  total_spent numeric,
  gst_recoverable numeric,
  pst_recoverable numeric,
  receipt_count bigint,
  avg_transaction numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROUND(SUM(r.total_amount)::numeric, 2) as total_spent,
    ROUND(SUM(COALESCE(r.tax_amount, 0))::numeric, 2) as gst_recoverable,
    ROUND(SUM(COALESCE(r.pst_amount, 0))::numeric, 2) as pst_recoverable,
    COUNT(*)::bigint as receipt_count,
    ROUND(AVG(r.total_amount)::numeric, 2) as avg_transaction
  FROM receipts r
  WHERE r.org_id = p_org_id
    AND r.is_deleted = false
    AND (p_role != 'Employee' OR r.user_id = p_user_id);
END;
$$;

NOTIFY pgrst, 'reload schema';
