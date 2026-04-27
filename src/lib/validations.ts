import { z } from 'zod';
import { CATEGORIES, PAYMENT_METHODS, USAGE_TYPES } from '@/components/scanner/types';

/* ─── Mutable copies for Zod compatibility ─── */
const PAYMENT_METHODS_MUTABLE = [...PAYMENT_METHODS] as [string, ...string[]];
const CATEGORIES_MUTABLE = [...CATEGORIES] as [string, ...string[]];
const USAGE_TYPES_MUTABLE = [...USAGE_TYPES] as [string, ...string[]];

export const receiptLineItemSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().min(0, 'Quantity cannot be negative'),
  unit_price: z.number().min(0, 'Unit price cannot be negative'),
  tax_rate: z.number().min(0, 'Tax rate cannot be negative'),
  tax_amount: z.number().min(0, 'Tax amount cannot be negative'),
  category: z.string().optional(),
  line_total: z.number().min(0, 'Line total cannot be negative'),
});

export const receiptFormSchema = z.object({
  vendor_name: z.string().min(2, 'Vendor name is required'),
  vendor_address: z.string(),
  business_number: z.string().max(15, 'GST/BN should be at most 15 characters'),
  vendor_tax_number: z.string().max(15, 'Tax Number should be at most 15 characters').optional(),
  transaction_date: z.string().min(1, 'Date is required'),
  transaction_time: z.string(),

  total_amount: z.number().min(0.01, 'Total must be greater than zero'),
  subtotal: z.number().min(0, 'Subtotal cannot be negative'),
  tax_amount: z.number().min(0, 'Tax amount cannot be negative'),
  pst_amount: z.number().min(0, 'PST amount cannot be negative'),

  currency: z.string().length(3, 'Currency must be 3 letters (e.g. CAD)'),
  exchange_rate: z.number().min(0).optional(),

  payment_method: z.enum(PAYMENT_METHODS_MUTABLE),
  payment_reference: z.string(),
  card_last_four: z.string().regex(/^\d{0,4}$/, 'Must be up to 4 digits'),

  category: z.enum(CATEGORIES_MUTABLE),
  notes: z.string(),

  job_code: z.string(),
  vehicle_id: z.string(),
  usage_type: z.enum(USAGE_TYPES_MUTABLE).nullable(),
  business_use_percent: z.number().min(0).max(100),
  business_unit_id: z.string(),

  capture_source: z.string(),
  document_type: z.string(),
  confidence_score: z.number().optional(),
  cra_readiness_score: z.number().optional(),
  thermal_warning: z.boolean().optional(),
  missing_bn_warning: z.boolean().optional(),
  math_mismatch_warning: z.boolean().optional(),
  fraud_suspicion: z.boolean().optional(),
  fraud_reason: z.string(),
  duplicate_hash: z.string(),
  duplicate_warning: z.boolean().optional(),

  paid_by: z.string(),
  reimbursement_status: z.string().nullable().optional(),
  approval_status: z.string().nullable().optional(),

  updated_at: z.string().optional(),

  line_items: z.array(receiptLineItemSchema).optional(),
}).superRefine((data, ctx) => {
  // Explanatory Guardrail: Vehicle ID for fuel
  if (data.category?.toLowerCase().includes('fuel') && !data.vehicle_id?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Vehicle ID is recommended for Fuel input tax credits.',
      path: ['vehicle_id'],
    });
  }
});

export type ReceiptFormValues = z.infer<typeof receiptFormSchema>;
