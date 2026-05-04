import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { isMathMismatch } from '@/lib/finance-utils';
import type { ReceiptRow, Project, AccessCode, UserRole } from '@/lib/types';

// ─── Zod Schemas ───

export const lineItemSchema = z.object({
  description: z.string().nullish().transform((val) => val ?? ''),
  quantity: z.number().nullish().transform((val) => val ?? 1),
  unit_price: z.number().nullish().transform((val) => val ?? 0),
  tax_rate: z.number().nullish().transform((val) => val ?? 0),
  tax_amount: z.number().nullish().transform((val) => val ?? 0),
  line_total: z.number().nullish().transform((val) => val ?? 0),
  category: z.string().nullish().transform((val) => val ?? ''),
}).catchall(z.any());

export const receiptSchema = z.object({
  id: z.string().nullish().transform((val) => val ?? ''),
  user_id: z.string().nullish().transform((val) => val ?? ''),
  business_unit_id: z.string().nullish().transform((val) => val ?? null),
  project_id: z.string().nullish().transform((val) => val ?? null),
  vendor_name: z.string().nullish().transform((val) => val ?? ''),
  vendor_address: z.string().nullish().transform((val) => val ?? ''),
  vendor_tax_number: z.string().nullish().transform((val) => val ?? ''),
  business_number: z.string().nullish().transform((val) => val ?? ''),
  transaction_date: z.string().nullish().transform((val) => val ?? ''),
  transaction_time: z.string().nullish().transform((val) => val ?? ''),
  subtotal: z.number().nullish().transform((val) => val ?? 0),
  tax_amount: z.number().nullish().transform((val) => val ?? 0),
  pst_amount: z.number().nullish().transform((val) => val ?? 0),
  total_amount: z.number().nullish().transform((val) => val ?? 0),
  currency: z.string().nullish().transform((val) => val ?? 'CAD'),
  exchange_rate: z.number().nullish().transform((val) => val ?? 1.0),
  cad_equivalent: z.number().nullish().transform((val) => val ?? null),
  blur_score: z.number().nullish().transform((val) => val ?? null),
  payment_method: z.string().nullish().transform((val) => val ?? ''),
  card_last_four: z.string().nullish().transform((val) => val ?? ''),
  category: z.string().nullish().transform((val) => val ?? ''),
  notes: z.string().nullish().transform((val) => val ?? ''),
  job_code: z.string().nullish().transform((val) => val ?? ''),
  vehicle_id: z.string().nullish().transform((val) => val ?? ''),
  usage_type: z.enum(['business', 'personal', 'mixed']).nullish().transform((val) => val ?? 'business'),
  business_use_percent: z.number().nullish().transform((val) => val ?? 0),
  line_items: z.any().transform((val) => {
    if (!val) return null;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return null; }
    }
    return val;
  }),
  integrity_hash: z.string().nullish().transform((val) => val ?? ''),
  confidence_score: z.number().nullish().transform((val) => val ?? 0),
  cra_readiness_score: z.number().nullish().transform((val) => val ?? 0),
  thermal_warning: z.boolean().nullish().transform((val) => val ?? false),
  capture_source: z.string().nullish().transform((val) => val ?? ''),
  document_type: z.string().nullish().transform((val) => val ?? 'receipt'),
  image_url: z.string().nullish().transform((val) => val ?? null),
  is_deleted: z.boolean().nullish().transform((val) => val ?? false),
  created_at: z.string().nullish().transform((val) => val ?? ''),
  updated_at: z.string().nullish().transform((val) => val ?? ''),
  paid_by: z.string().nullish().transform((val) => val ?? null),
  reimbursement_status: z.string().nullish().transform((val) => val ?? null),
  needs_reimbursement: z.boolean().nullish().transform((val) => val ?? false),
  approval_status: z.string().nullish().transform((val) => val ?? null),
  duplicate_hash: z.string().nullish().transform((val) => val ?? ''),
  math_mismatch_warning: z.boolean().nullish().transform((val) => val ?? false),
  duplicate_warning: z.boolean().optional(),
  missing_bn_warning: z.boolean().optional(),
  flagged_for_audit: z.boolean().optional(),
  high_audit_risk: z.boolean().optional(),
  fraud_suspicion: z.boolean().optional(),
  fraud_reason: z.string().nullish().transform((val) => val ?? ''),
}).catchall(z.any());

// ─── Receipt Queries ───

export async function getReceipts(role: UserRole, userId?: string, limit = 1000, offset = 0): Promise<ReceiptRow[]> {
  if (!userId) return [];

  let query = supabase
    .from('receipts')
    .select('*')
    .eq('is_deleted', false)
    .range(offset, offset + limit - 1)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (role === 'Employee') {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching receipts:', error);
    throw error;
  }

  return (data || []).map((row) => receiptSchema.parse(row) as ReceiptRow);
}

export async function getReceiptsPaginated(params: {
  role: UserRole;
  userId?: string;
  limit?: number;
  offset?: number;
  category?: string;
  fromDate?: string;
  toDate?: string;
  approvalStatus?: string;
  search?: string;
}): Promise<{ receipts: ReceiptRow[]; totalCount: number }> {
  if (!params.userId) return { receipts: [], totalCount: 0 };

  const { data: orgData } = await supabase.rpc('get_user_org');
  const orgId = orgData as unknown as string;
  if (!orgId) return { receipts: [], totalCount: 0 };

  const { data, error } = await supabase.rpc('get_receipts_paginated', {
    p_org_id: orgId,
    p_user_id: params.userId,
    p_role: params.role,
    p_limit: params.limit || 25,
    p_offset: params.offset || 0,
    p_category: params.category || null,
    p_from_date: params.fromDate || null,
    p_to_date: params.toDate || null,
    p_approval_status: params.approvalStatus || null,
    p_search: params.search || null,
  });

  if (error) {
    console.error('Error fetching paginated receipts:', error);
    throw error;
  }

  // The RPC returns an array of rows: { receipt: JSON, total_count: bigint }
  const rows = data as any[];
  if (!rows || rows.length === 0) return { receipts: [], totalCount: 0 };

  const totalCount = Number(rows[0].total_count);
  const receipts = rows.map(r => receiptSchema.parse(r.receipt) as ReceiptRow);

  return { receipts, totalCount };
}

export const getReceiptsPendingApproval = async (): Promise<ReceiptRow[]> => {
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('is_deleted', false)
    .eq('approval_status', 'submitted')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pending receipts:', error);
    throw error;
  }
  return (data || []).map((row) => receiptSchema.parse(row) as ReceiptRow);
};

export interface DashboardSummary {
  totalSpent: number;
  gstRecoverable: number;
  pstRecoverable: number;
  receiptCount: number;
  avgTransaction: number;
  missingBNCount: number;
  pendingReviewCount: number;
  flaggedAuditCount: number;
  spendingByCategory: { name: string; amount: number }[];
  monthlyTrend: { month: string; amount: number }[];
  reimbursementQueue: ReceiptRow[];
}

export const getDashboardSummary = async (role: UserRole, userId: string): Promise<DashboardSummary> => {
  const { data: orgData } = await supabase.rpc('get_user_org');
  const orgId = orgData as unknown as string;
  if (!orgId) throw new Error('No organization found');

  // 1. Fetch Core Stats via RPC
  const { data: stats, error: statsError } = await supabase.rpc('get_dashboard_stats', { 
    p_org_id: orgId,
    p_user_id: userId,
    p_role: role
  });
  if (statsError) throw statsError;
  const mainStats = stats[0] || {};

  // 2. Fetch Category Breakdown
  let categoryQuery = supabase
    .from('receipts')
    .select('category, total_amount')
    .eq('org_id', orgId)
    .eq('is_deleted', false);
  
  if (role === 'Employee') categoryQuery = categoryQuery.eq('user_id', userId);
  
  const { data: categoryData } = await categoryQuery;
  const categoryMap = new Map<string, number>();
  (categoryData || []).forEach(r => {
    const cat = r.category || 'Uncategorized';
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + Number(r.total_amount || 0));
  });

  const spendingByCategory = Array.from(categoryMap.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  // 3. Fetch Alert Counts
  const { count: missingBN } = await supabase.from('receipts').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_deleted', false).is('vendor_tax_number', null);
  const { count: pendingReview } = await supabase.from('receipts').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_deleted', false).eq('approval_status', 'submitted');
  const { count: flaggedAudit } = await supabase.from('receipts').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_deleted', false).eq('flagged_for_audit', true);

  // 4. Fetch Reimbursement Queue
  const { data: reimbursements } = await supabase
    .from('receipts')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_deleted', false)
    .eq('paid_by', 'employee_cash')
    .eq('reimbursement_status', 'pending')
    .limit(5);

  return {
    totalSpent: Number(mainStats.total_spent || 0),
    gstRecoverable: Number(mainStats.gst_recoverable || 0),
    pstRecoverable: Number(mainStats.pst_recoverable || 0),
    receiptCount: Number(mainStats.receipt_count || 0),
    avgTransaction: Number(mainStats.avg_transaction || 0),
    missingBNCount: missingBN || 0,
    pendingReviewCount: pendingReview || 0,
    flaggedAuditCount: flaggedAudit || 0,
    spendingByCategory,
    monthlyTrend: [], 
    reimbursementQueue: (reimbursements || []).map(r => receiptSchema.parse(r) as ReceiptRow),
  };
};

export const getReimbursementsPending = async (userId: string): Promise<ReceiptRow[]> => {
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('is_deleted', false)
    .eq('needs_reimbursement', true)
    .or('reimbursement_status.eq.pending,reimbursement_status.is.null')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => receiptSchema.parse(row) as ReceiptRow);
};

export const getBusinessUnits = async () => {
  const { data, error } = await supabase.from('business_units').select('id, name');
  if (error) {
    console.error('Error fetching business units:', error);
    throw error;
  }
  return data || [];
};

export const deleteReceipt = async (receiptId: string, userId: string): Promise<void> => {
  const { error } = await supabase
    .from('receipts')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', receiptId);

  if (error) throw error;

  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'receiptdeleted',
    details: `Receipt marked as deleted by user ${userId}.`,
  });
};

export const getAuditLogs = async (limit = 50) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get user's org
  const { data: orgData } = await supabase.rpc('get_user_org');
  const orgId = orgData as unknown as string;
  if (!orgId) return [];

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('org_id', orgId)  // ← ADD THIS LINE
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('Error fetching audit logs:', error);
    throw error;
  }
  return data || [];
};

// ─── Project Services ───

export const getProjects = async (): Promise<Project[]> => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []) as Project[];
};

export const createProject = async (name: string, code?: string): Promise<Project> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('projects')
    .insert({ name, code: code ?? null, user_id: user.id })
    .select()
    .single();

  if (error) throw error;
  return data as Project;
};

export const deleteProject = async (projectId: string): Promise<void> => {
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) throw error;
};

// ─── Access Code Services ───

export const generateAccessCode = async (role: UserRole = 'Employee', businessUnitId?: string): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase.rpc('generate_access_code', {
    p_created_by: user.id,
    p_role: role,
    p_bu_id: businessUnitId ?? null,
  });

  if (error) throw error;
  return data as string;
};

export const redeemAccessCode = async (code: string, userId: string): Promise<{ success: boolean; role?: string; error?: string }> => {
  const { data, error } = await supabase.rpc('redeem_access_code', {
    p_code: code,
    p_user_id: userId,
  });

  if (error) return { success: false, error: error.message };
  const result = data as { success: boolean; role?: string; error?: string };
  return result;
};

export const getMyAccessCodes = async (): Promise<AccessCode[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('access_codes')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw error;
  return (data || []) as AccessCode[];
};

// ─── Approval Services ───

export const updateReceiptApproval = async (
  receiptId: string,
  status: 'approved' | 'rejected',
  userId: string,
  needsReimburse: boolean,
  vendorName: string,
  transactionDate: string,
  role: string
) => {
  const updatePayload: Record<string, unknown> = {
    approval_status: status,
    updated_at: new Date().toISOString(),
  };

  if (needsReimburse) {
    updatePayload.reimbursement_status = status === 'approved' ? 'pending' : 'rejected';
  }

  const { error } = await supabase
    .from('receipts')
    .update(updatePayload)
    .eq('id', receiptId);

  if (error) throw new Error(error.message);

  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: `receipt${status}`,
    details: `Receipt ${status}: ${vendorName} (${transactionDate}) by ${role}`,
  });
};

export const bulkUpdateApproval = async (
  receiptIds: string[],
  status: 'approved' | 'rejected',
  userId: string
) => {
  const { error } = await supabase
    .from('receipts')
    .update({ approval_status: status, updated_at: new Date().toISOString() })
    .in('id', receiptIds);

  if (error) throw new Error(error.message);

  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: `bulk_${status}`,
    details: `Bulk ${status}: ${receiptIds.length} receipts by ${userId}`,
  });
};

// ─── Edit Services (Immutable Archive-Before-Update) ───

export const updateReceipt = async (
  receiptId: string,
  updatedData: Partial<ReceiptRow>,
  userId: string,
  originalReceipt: ReceiptRow
) => {
  // Archive full snapshot to receipt_history FIRST
  const { error: archiveError } = await supabase
    .from('receipt_history')
    .insert({
      receipt_id: originalReceipt.id,
      user_id: originalReceipt.user_id,
      vendor_name: originalReceipt.vendor_name,
      vendor_tax_number: originalReceipt.vendor_tax_number ?? originalReceipt.business_number ?? null,
      business_number: originalReceipt.business_number ?? null,
      transaction_date: originalReceipt.transaction_date,
      total_amount: originalReceipt.total_amount,
      subtotal: originalReceipt.subtotal ?? null,
      tax_amount: originalReceipt.tax_amount,
      pst_amount: originalReceipt.pst_amount ?? null,
      payment_method: originalReceipt.payment_method,
      category: originalReceipt.category,
      notes: originalReceipt.notes,
      document_type: originalReceipt.document_type ?? 'receipt',
      project_id: originalReceipt.project_id ?? null,
      exchange_rate: originalReceipt.exchange_rate ?? null,
      cad_equivalent: originalReceipt.cad_equivalent ?? null,
      duplicate_hash: originalReceipt.duplicate_hash,
      integrity_hash: originalReceipt.integrity_hash,
      archived_at: new Date().toISOString(),
      archived_by: userId,
    });

  if (archiveError) throw new Error(`History archive failed: ${archiveError.message}`);

  const updatePayload = {
    ...updatedData,
    updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabase
    .from('receipts')
    .update(updatePayload)
    .eq('id', receiptId);

  if (updateError) throw new Error(updateError.message);

  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'receiptedited',
    details: `Receipt updated: ${Object.keys(updatedData).join(', ')} modified for ${originalReceipt.vendor_name}. Previous version archived.`,
  });
};

export const updateReceiptNotes = async (
  receiptId: string,
  notesValue: string,
  userId: string,
  receipt: ReceiptRow
) => {
  return updateReceipt(receiptId, { notes: notesValue }, userId, receipt);
};

// ─── Save Receipt (with Merkle chain) ───

export const saveReceipt = async (
  payload: Record<string, unknown>,
  integrityHash: string,
  userId: string
) => {
  const isMismatch = isMathMismatch(
    Number(payload.subtotal ?? 0),
    Number(payload.tax_amount ?? 0),
    Number(payload.pst_amount ?? 0),
    Number(payload.total_amount ?? 0)
  );

  // Compute CAD equivalent for non-CAD receipts
  const currency = String(payload.currency ?? 'CAD');
  const exchangeRate = Number(payload.exchange_rate ?? 1.0);
  const totalAmount = Number(payload.total_amount ?? 0);
  const cadEquivalent = currency !== 'CAD' ? Math.round(totalAmount * exchangeRate * 100) / 100 : null;

  // Merkle chain: get last event_hash from audit_logs
  let previousHash: string | null = null;
  try {
    const { data: lastLog } = await supabase
      .from('audit_logs')
      .select('event_hash')
      .eq('user_id', userId)
      .not('event_hash', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    previousHash = lastLog?.event_hash ?? null;
  } catch {
    previousHash = null;
  }

  const finalPayload = {
    ...payload,
    business_unit_id: payload.business_unit_id === '' ? null : payload.business_unit_id,
    project_id: payload.project_id === '' ? null : payload.project_id,
    integrity_hash: integrityHash,
    math_mismatch_warning: isMismatch,
    cad_equivalent: cadEquivalent,
    exchange_rate: exchangeRate,
  } as Record<string, unknown>;

  // Strip empty strings to prevent database pollution
  Object.keys(finalPayload).forEach(key => {
    if (finalPayload[key] === '') {
      finalPayload[key] = null;
    }
  });

  const { data, error } = await supabase
    .from('receipts')
    .insert([finalPayload])
    .select('id')
    .single();

  if (error) throw error;

  // Write audit log with Merkle chain
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'receiptcreated',
    details: `Receipt created: ${payload.vendor_name || 'Unknown'} (${payload.transaction_date || 'Unknown Date'}) currency=${currency}`,
    event_hash: integrityHash,
    previous_hash: previousHash,
  });

  return data;
};
