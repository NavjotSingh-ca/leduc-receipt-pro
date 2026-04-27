import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { isMathMismatch } from '@/lib/finance-utils';
import type { ReceiptRow } from '@/lib/types';
import type { UserRole } from '@/lib/types';

// Zod schema for defensive mapping with aggressive fallbacks
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
  vendor_name: z.string().nullish().transform((val) => val ?? ''),
  vendor_address: z.string().nullish().transform((val) => val ?? ''),
  vendor_tax_number: z.string().nullish().transform((val) => val ?? ''),
  transaction_date: z.string().nullish().transform((val) => val ?? ''),
  transaction_time: z.string().nullish().transform((val) => val ?? ''),
  subtotal: z.number().nullish().transform((val) => val ?? 0),
  tax_amount: z.number().nullish().transform((val) => val ?? 0),
  pst_amount: z.number().nullish().transform((val) => val ?? 0),
  total_amount: z.number().nullish().transform((val) => val ?? 0),
  currency: z.string().nullish().transform((val) => val ?? 'CAD'),
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
  image_url: z.string().nullish().transform((val) => val ?? null),
  is_deleted: z.boolean().nullish().transform((val) => val ?? false),
  created_at: z.string().nullish().transform((val) => val ?? ''),
  paid_by: z.string().nullish().transform((val) => val ?? null),
  reimbursement_status: z.string().nullish().transform((val) => val ?? null),
  needs_reimbursement: z.boolean().nullish().transform((val) => val ?? false),
  approval_status: z.string().nullish().transform((val) => val ?? null),
  duplicate_hash: z.string().nullish().transform((val) => val ?? ''),
  math_mismatch_warning: z.boolean().nullish().transform((val) => val ?? false),
  duplicate_warning: z.boolean().nullish().transform((val) => val ?? false),
  missing_bn_warning: z.boolean().nullish().transform((val) => val ?? false),
  flagged_for_audit: z.boolean().nullish().transform((val) => val ?? false),
  fraud_suspicion: z.boolean().nullish().transform((val) => val ?? false),
  fraud_reason: z.string().nullish().transform((val) => val ?? ''),
});

export const getReceipts = async (role: UserRole, userId?: string): Promise<ReceiptRow[]> => {
  if (!userId) return [];

  let queryReq = supabase
    .from('receipts')
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (role === 'Employee') {
    queryReq = queryReq.eq('user_id', userId);
  }

  const { data, error } = await queryReq;
  if (error) throw error;

  return (data || []).map((row) => receiptSchema.parse(row) as ReceiptRow);
};

export const getBusinessUnits = async () => {
  const { data, error } = await supabase.from('businessunits').select('id, name');
  if (error) throw error;
  return data || [];
};

export const getAuditLogs = async (limit = 50) => {
  const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
};

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
    updatePayload.reimbursement_status = status;
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

export const updateReceiptNotes = async (
  receiptId: string,
  notesValue: string,
  userId: string,
  receipt: ReceiptRow
) => {
  // Archive to receipt_history first
  const { error: archiveError } = await supabase
    .from('receipt_history')
    .insert({
      receipt_id: receipt.id,
      vendor_name: receipt.vendor_name,
      transaction_date: receipt.transaction_date,
      total_amount: receipt.total_amount,
      category: receipt.category,
      notes: receipt.notes,
      duplicate_hash: receipt.duplicate_hash,
      integrity_hash: receipt.integrity_hash,
      archived_at: new Date().toISOString(),
      archived_by: userId,
    });

  if (archiveError) throw new Error(`History archive failed: ${archiveError.message}`);

  // Update notes
  const { error: updateError } = await supabase
    .from('receipts')
    .update({ notes: notesValue, updated_at: new Date().toISOString() })
    .eq('id', receiptId);

  if (updateError) throw new Error(updateError.message);

  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'receiptedited',
    details: `Receipt updated: Notes modified for ${receipt.vendor_name}. Previous version archived.`,
  });
};

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

  const finalPayload = { 
    ...payload, 
    integrity_hash: integrityHash,
    math_mismatch_warning: isMismatch
  };

  const { data, error } = await supabase
    .from('receipts')
    .insert([finalPayload])
    .select('id')
    .single();

  if (error) throw error;

  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'receiptcreated',
    details: `Receipt created: ${payload.vendor_name || 'Unknown'} (${payload.transaction_date || 'Unknown Date'})`,
    event_hash: integrityHash
  });

  return data;
};
