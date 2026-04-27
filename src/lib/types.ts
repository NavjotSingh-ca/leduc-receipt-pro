/* ─── Shared Types — 9 Star Labs v2.0 ─── */

export type CaptureSource = 'camera' | 'upload' | 'email' | 'email_screenshot' | 'bulk-import' | 'accountant-import';
export type UsageType = 'business' | 'personal' | 'mixed';
export type DocumentType = 'receipt' | 'invoice' | 'statement' | 'estimate' | 'unknown';
export type SourceFileType = 'image' | 'pdf' | 'heic' | 'png' | 'jpg' | 'jpeg' | '';

export type UserRole = 'Owner' | 'Employee' | 'Accountant';

export type PaidBy = 'company_card' | 'employee_cash' | '';
export type ReimbursementStatus = 'pending' | 'approved' | 'rejected' | '';
export type ApprovalStatus = 'submitted' | 'approved' | 'rejected' | '';

export interface ReceiptLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount: number;
  category: string;
  line_total: number;
}

/** Canonical ReceiptRow — strict snake_case matching Supabase columns */
export interface ReceiptRow {
  id: string;
  user_id: string;
  business_unit_id?: string | null;
  project_id?: string | null;

  vendor_name: string;
  vendor_address?: string | null;
  business_number?: string | null;
  vendor_tax_number?: string | null;

  total_amount: number;
  subtotal?: number | null;
  tax_amount: number;
  pst_amount?: number | null;

  /** Non-CAD receipt support */
  currency: string;
  exchange_rate?: number | null;
  cad_equivalent?: number | null;

  transaction_date: string;
  transaction_time?: string | null;

  payment_method: string;
  payment_reference?: string | null;
  card_last_four?: string | null;

  category: string;
  notes: string;

  image_url?: string | null;
  source_file_name?: string | null;
  source_file_type?: SourceFileType | string | null;

  integrity_hash?: string | null;
  duplicate_hash?: string | null;

  confidence_score?: number | null;
  cra_readiness_score?: number | null;

  /** Blur detection score (0–1). Values below 0.15 were flagged as blurry at capture. */
  blur_score?: number | null;

  thermal_warning?: boolean | null;
  capture_source?: CaptureSource | string | null;
  document_type?: DocumentType | string | null;
  usage_type?: UsageType | null;
  business_use_percent?: number | null;

  job_code?: string | null;
  vehicle_id?: string | null;

  line_items?: ReceiptLineItem[] | null;

  /* ─── Payment & Reimbursement ─── */
  paid_by?: PaidBy | string | null;
  reimbursement_status?: ReimbursementStatus | string | null;
  needs_reimbursement?: boolean | null;

  /* ─── Approval Workflow ─── */
  approval_status?: ApprovalStatus | string | null;

  is_deleted?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;

  /* Audit/review fields */
  accountant_status?: string | null;
  review_status?: string | null;
  flagged_for_audit?: boolean | null;
  needs_review?: boolean | null;
  duplicate_warning?: boolean | null;
  math_mismatch_warning?: boolean | null;
  missing_bn_warning?: boolean | null;
  high_audit_risk?: boolean | null;
  fraud_suspicion?: boolean | null;
  fraud_reason?: string | null;

  /* ─── Optimistic UI ─── */
  _optimistic?: boolean;
}

export interface AuditLogRow {
  id: string;
  user_id?: string;
  action?: string;
  details?: string;
  event_hash?: string | null;
  previous_hash?: string | null;
  created_at?: string;
}

/** Project / Job code entity */
export interface Project {
  id: string;
  name: string;
  code?: string | null;
  user_id: string;
  created_at?: string | null;
}

/** Employee invite code */
export interface AccessCode {
  id: string;
  code: string;
  role: UserRole;
  business_unit_id?: string | null;
  created_by: string;
  expires_at: string;
  used_by?: string | null;
  used_at?: string | null;
  created_at?: string | null;
}
