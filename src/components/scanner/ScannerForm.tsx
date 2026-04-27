'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CheckCircle2, DollarSign, FileText, Hash, Plus, Trash2, Info, Loader2 } from 'lucide-react';

import type { ReceiptForm, ReceiptLineItem, ScannerFormProps } from './types';
import { CATEGORIES, PAYMENT_METHODS, USAGE_TYPES } from './types';
import { shouldGlow, computeLiveCRAScore } from '@/lib/ui-utils';
import { receiptFormSchema, ReceiptFormValues } from '@/lib/validations';
import { isMathMismatch } from '@/lib/finance-utils';

const inputCls =
  'w-full rounded-xl border border-glass-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-champagne/40 focus:ring-2 focus:ring-champagne/15';

const errorInputCls =
  'w-full rounded-xl border border-red-500/40 bg-red-500/[0.06] px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-red-500/60 focus:ring-2 focus:ring-red-500/15';

const warningInputCls =
  'w-full rounded-xl border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/15';

function safeNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function updateComputedLineTotal(item: ReceiptLineItem): ReceiptLineItem {
  const quantity = safeNumber(item.quantity);
  const unitPrice = safeNumber(item.unit_price);
  const lineTotal = Math.round(quantity * unitPrice * 100) / 100;

  return {
    ...item,
    quantity,
    unit_price: unitPrice,
    tax_rate: safeNumber(item.tax_rate),
    tax_amount: safeNumber(item.tax_amount),
    line_total: lineTotal,
  };
}

/* ─── CRA Score Color ─── */

function craScoreColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

export default function ScannerForm({
  formData: rawFormData,
  setFormData,
  businessUnits,
  saving,
  onSave,
  hasAnalyzed,
}: ScannerFormProps & { hasAnalyzed?: boolean }) {
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Initialize RHF
  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<ReceiptFormValues>({
    resolver: zodResolver(receiptFormSchema),
    defaultValues: rawFormData,
  });
  
  const { fields: lineItems, append, remove } = useFieldArray({
    control,
    name: "line_items"
  });

  // Watch entire form for live metrics
  const formData = watch();

  // Sync upstream incoming formData shifts — reset entire form when AI data arrives
  useEffect(() => {
    reset(rawFormData);
    setIsConfirmed(false);
  }, [rawFormData, reset]);

  const missingBN = Boolean(errors.business_number) || !String(formData.business_number ?? '').trim();
  
  // Custom Math Mismatch Check avoiding blocker
  const mathMismatch = isMathMismatch(
    safeNumber(formData.subtotal),
    safeNumber(formData.tax_amount),
    safeNumber(formData.pst_amount),
    safeNumber(formData.total_amount)
  );

  const thermalWarning = Boolean(formData.thermal_warning);
  const fraudSuspicion = Boolean(formData.fraud_suspicion);
  const fraudReason = formData.fraud_reason || 'AI detected a potential anomaly or policy violation in this receipt.';

  /* ─── Real-Time CRA Score ─── */
  const liveCRAScore = useMemo(() => computeLiveCRAScore({
    vendor_name: formData.vendor_name ?? '',
    vendor_address: formData.vendor_address ?? '',
    business_number: formData.business_number ?? '',
    transaction_date: formData.transaction_date ?? '',
    total_amount: safeNumber(formData.total_amount),
    subtotal: safeNumber(formData.subtotal),
    tax_amount: safeNumber(formData.tax_amount),
    pst_amount: safeNumber(formData.pst_amount),
    payment_method: formData.payment_method ?? '',
    notes: formData.notes ?? '',
    line_items: lineItems as ReceiptLineItem[],
  }), [formData, lineItems]);

  const lowReadiness = liveCRAScore < 70;
  const glowActive = shouldGlow(safeNumber(formData.confidence_score));
  const isNonCAD = formData.currency && formData.currency !== 'CAD';

  /* ─── Explainable Policy Engine Flags ─── */
  const isHighValue = safeNumber(formData.total_amount) > 500;
  const needsVehicleId = formData.category?.toLowerCase().includes('fuel') && !formData.vehicle_id?.trim();
  const isOutOfProvince = Boolean(formData.vendor_address) && !/Alberta|AB\b/i.test(formData.vendor_address ?? '');

  const performSave = (data: ReceiptFormValues) => {
    // Math mismatch injects high_audit_risk flag without blocking Zod submission
    const finalData = { ...data, high_audit_risk: mathMismatch };
    // Call parent onSave, passing the RHF verified payload
    setFormData(finalData as unknown as ReceiptForm);
    onSave();
  };

  return (
    <form onSubmit={handleSubmit(performSave)} className="space-y-5 fade-in">
      {/* Header */}
      <div className="rounded-3xl border border-glass-border bg-surface px-5 py-4 shadow-sm">
        <h3 className="text-base font-bold text-text-primary">Review extracted data</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Verify OCR results and complete any missing CRA-relevant fields.
        </p>
      </div>

      {/* Warnings & Live Policy Guardrails */}
      <div className="space-y-3">
        {formData.document_type?.toLowerCase() === 'estimate' && (
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] px-4 py-3">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-400" />
              <div>
                <p className="text-sm font-bold text-blue-300">Notice: This is an Estimate</p>
                <p className="mt-1 text-xs leading-relaxed text-blue-400/80">This is not a tax-deductible receipt yet. Ensure you receive a final invoice or receipt upon payment.</p>
              </div>
            </div>
          </div>
        )}
        
        {(missingBN || mathMismatch || thermalWarning || lowReadiness || fraudSuspicion || isHighValue || needsVehicleId || isOutOfProvince) && (
          <>
          {/* Policy Flags */}
          {isHighValue && (
            <div className="rounded-2xl border border-[#dfcaaa]/40 bg-[#dfcaaa]/10 px-4 py-3 shadow-[0_0_15px_rgba(190,169,142,0.15)]">
              <div className="flex items-start gap-3">
                <DollarSign className="mt-0.5 h-4 w-4 flex-shrink-0 text-champagne" />
                <div>
                  <p className="text-sm font-bold text-champagne">Audit Flag: High-Value Expense requires Owner Approval</p>
                  <p className="mt-1 text-xs leading-relaxed text-champagne/80">Expenses over $500 will enter the Owner Queue before reimbursement.</p>
                </div>
              </div>
            </div>
          )}
          {needsVehicleId && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-bold text-amber-300">CRA Tip: Vehicle ID is mandatory for fuel ITC.</p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-400/80">Input the physical truck or asset ID to claim input tax credits safely.</p>
                </div>
              </div>
            </div>
          )}
          {isOutOfProvince && (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-400" />
                <div>
                  <p className="text-sm font-bold text-blue-300">Out-of-Province Expense Detected</p>
                  <p className="mt-1 text-xs leading-relaxed text-blue-400/80">Ensure proper PST/HST rates are applied for non-Alberta transactions.</p>
                </div>
              </div>
            </div>
          )}

          {/* Core AI Flags */}
          {fraudSuspicion && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.08] px-4 py-3 shadow-lg shadow-red-500/5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-bold text-red-400">AI Anomaly Detected</p>
                  <p className="mt-1 text-xs leading-relaxed text-red-300">
                    {fraudReason}
                  </p>
                </div>
              </div>
            </div>
          )}
          {missingBN && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-bold text-amber-300">Missing GST / Business Number</p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-400/80">
                    CRA claims are harder to support when the supplier GST/BN is missing.
                  </p>
                </div>
              </div>
            </div>
          )}
          {mathMismatch && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-bold text-amber-300">Caution: Totals do not match. Proceed with override?</p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-400/80">
                    The subtotal plus taxes does not match the total within expected tolerance. A high audit risk flag will be attached.
                  </p>
                </div>
              </div>
            </div>
          )}
          {thermalWarning && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-bold text-amber-300">Thermal receipt warning</p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-400/80">
                    This appears to be a thermal receipt. Back it up promptly.
                  </p>
                </div>
              </div>
            </div>
          )}
          {lowReadiness && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-bold text-amber-300">Low CRA readiness</p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-400/80">
                    The extracted record may be incomplete. Double check vendor, taxes, and dates.
                  </p>
                </div>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* Card 1: Store Info */}
      <div className="rounded-3xl border border-glass-border bg-surface shadow-sm">
        <div className="border-b border-glass-border px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">1. Store Info</p>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Vendor Name</label>
              <input type="text" {...register('vendor_name')} className={`${errors.vendor_name ? errorInputCls : (glowActive ? inputCls + ' self-healing-glow' : inputCls)}`} placeholder="Supplier name" />
              {errors.vendor_name && <p className="mt-1 text-xs text-red-500">{errors.vendor_name.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Vendor Address</label>
              <input type="text" {...register('vendor_address')} className={inputCls} placeholder="123 Main St, Calgary, AB" />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Date
                <span className="group relative flex items-center">
                  <Info className="h-3 w-3 text-champagne cursor-help" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden w-max max-w-[200px] rounded-lg bg-surface-raised px-2 py-1 text-[10px] text-text-primary shadow-xl group-hover:block border border-glass-border">
                    CRA Required: Needed for ITCs.
                  </span>
                </span>
              </label>
              <input type="date" {...register('transaction_date')} className={errors.transaction_date ? errorInputCls : inputCls} />
              {errors.transaction_date && <p className="mt-1 text-xs text-red-500">{errors.transaction_date.message}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Time</label>
              <input type="time" {...register('transaction_time')} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Payment Method</label>
              <select {...register('payment_method')} className={inputCls}>
                {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Card end digits</label>
              <input type="text" maxLength={4} {...register('card_last_four')} className={errors.card_last_four ? errorInputCls : inputCls} placeholder="1234" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Payment Ref</label>
              <input type="text" {...register('payment_reference')} className={inputCls} placeholder="Approval Code" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Currency</label>
              <input type="text" {...register('currency')} className={errors.currency ? errorInputCls : inputCls} placeholder="CAD" />
            </div>
          </div>
        </div>
      </div>

      {/* Card 1.5: Who Paid? (Payment Context) */}
      <div className="rounded-3xl border border-glass-border bg-surface shadow-sm">
        <div className="border-b border-glass-border px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">Payment Context</p>
        </div>
        <div className="p-5">
          <p className="mb-3 text-sm font-semibold text-text-primary">Who paid for this?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setValue('paid_by', 'company_card');
                setValue('reimbursement_status', null);
              }}
              className={`rounded-2xl border p-4 text-left transition ${
                formData.paid_by === 'company_card'
                  ? 'border-champagne/40 bg-champagne/[0.08]'
                  : 'border-glass-border bg-surface-raised hover:border-glass-border-hover'
              }`}
            >
              <div className="flex items-center gap-2">
                <DollarSign className={`h-4 w-4 ${formData.paid_by === 'company_card' ? 'text-champagne' : 'text-text-muted'}`} />
                <span className={`text-sm font-semibold ${formData.paid_by === 'company_card' ? 'text-champagne' : 'text-text-secondary'}`}>
                  Company Card
                </span>
              </div>
              <p className="mt-1 text-xs text-text-muted">No reimbursement needed</p>
            </button>

            <button
              type="button"
              onClick={() => {
                setValue('paid_by', 'employee_cash');
                setValue('reimbursement_status', 'pending');
              }}
              className={`rounded-2xl border p-4 text-left transition ${
                formData.paid_by === 'employee_cash'
                  ? 'border-amber-500/40 bg-amber-500/[0.08]'
                  : 'border-glass-border bg-surface-raised hover:border-glass-border-hover'
              }`}
            >
              <div className="flex items-center gap-2">
                <DollarSign className={`h-4 w-4 ${formData.paid_by === 'employee_cash' ? 'text-amber-400' : 'text-text-muted'}`} />
                <span className={`text-sm font-semibold ${formData.paid_by === 'employee_cash' ? 'text-amber-400' : 'text-text-secondary'}`}>
                  Employee Cash
                </span>
              </div>
              <p className="mt-1 text-xs text-text-muted">Reimbursement needed</p>
            </button>
          </div>

          {formData.paid_by === 'employee_cash' && (
            <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-amber-300">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span className="font-semibold">Reimbursement queued</span>
              </div>
              <p className="mt-1 text-xs text-amber-400/80">This receipt will appear in the Owner reimbursement queue for approval.</p>
            </div>
          )}
        </div>
      </div>

      {/* Card 2: Financials */}
      <div className="rounded-3xl border border-glass-border bg-surface shadow-sm">
        <div className="border-b border-glass-border px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">2. Financials</p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Subtotal</label>
              <input type="number" step="0.01" min="0" {...register('subtotal', { valueAsNumber: true })} className={errors.subtotal ? errorInputCls : inputCls} />
              {errors.subtotal && <p className="mt-1 text-xs text-red-500">{errors.subtotal.message}</p>}
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Total
                <span className="group relative flex items-center">
                  <Info className="h-3 w-3 text-champagne cursor-help" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden w-max max-w-[200px] rounded-lg bg-surface-raised px-2 py-1 text-[10px] text-text-primary shadow-xl group-hover:block border border-glass-border">
                    CRA Required: Needed for ITCs.
                  </span>
                </span>
              </label>
              <input type="number" step="0.01" min="0" {...register('total_amount', { valueAsNumber: true })} className={errors.total_amount ? errorInputCls : (glowActive ? inputCls + ' self-healing-glow' : inputCls)} />
              {errors.total_amount && <p className="mt-1 text-xs text-red-500">{errors.total_amount.message}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">GST Amount</label>
              <input type="number" step="0.01" min="0" {...register('tax_amount', { valueAsNumber: true })} className={errors.tax_amount ? errorInputCls : inputCls} />
              {errors.tax_amount && <p className="mt-1 text-xs text-red-500">{errors.tax_amount.message}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">PST / HST</label>
              <input type="number" step="0.01" min="0" {...register('pst_amount', { valueAsNumber: true })} className={errors.pst_amount ? errorInputCls : inputCls} />
              {errors.pst_amount && <p className="mt-1 text-xs text-red-500">{errors.pst_amount.message}</p>}
            </div>
          </div>

          {/* Multi-Currency Exchange Rate */}
          {isNonCAD && (
            <div className="mt-4 rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-400">Non-CAD Currency Detected: {formData.currency}</p>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Exchange Rate to CAD</label>
                <input type="number" step="0.0001" min="0" {...register('exchange_rate', { valueAsNumber: true })} className={inputCls} placeholder="1.0000" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card 3: Compliance */}
      <div className="rounded-3xl border border-glass-border bg-surface shadow-sm">
        <div className="border-b border-glass-border px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">3. Compliance</p>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                GST / Vendor Tax Number
                <span className="group relative flex items-center">
                  <Info className="h-3 w-3 text-champagne cursor-help" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden w-max max-w-[200px] rounded-lg bg-surface-raised px-2 py-1 text-[10px] text-text-primary shadow-xl group-hover:block border border-glass-border z-10">
                    CRA Required: Needed for ITCs.
                  </span>
                </span>
              </label>
              <input type="text" {...register('business_number')} className={errors.business_number ? errorInputCls : (missingBN ? warningInputCls : inputCls)} placeholder="123456789RT0001" />
              {errors.business_number && <p className="mt-1 text-xs text-red-500">{errors.business_number.message}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Category</label>
              <select {...register('category')} className={inputCls}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Usage Type</label>
              <select {...register('usage_type')} className={inputCls}>
                {USAGE_TYPES.map((u) => <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Job code</label>
              <input type="text" {...register('job_code')} className={inputCls} placeholder="JOB-1042" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Vehicle ID</label>
              <input type="text" {...register('vehicle_id')} className={errors.vehicle_id ? errorInputCls : inputCls} placeholder="Truck 12" />
              {errors.vehicle_id && <p className="mt-1 text-xs text-red-500">{errors.vehicle_id.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Business unit</label>
              <select {...register('business_unit_id')} className={inputCls}>
                <option value="">Unassigned</option>
                {businessUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Business purpose / memo</label>
              <textarea rows={3} {...register('notes')} className={`${inputCls} resize-none`} placeholder="Describe the business purpose..." />
            </div>
          </div>
        </div>
      </div>

      {/* High-Density Line Items (Stacked Row Format) */}
      <div className="overflow-hidden rounded-3xl border border-glass-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-glass-border px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">Line Items</p>
          <button type="button" onClick={() => append({ description: '', quantity: 1, unit_price: 0, tax_rate: 0, tax_amount: 0, line_total: 0 })} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-raised px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition hover:bg-glass-border-hover hover:text-text-primary">
            <Plus className="h-3 w-3" /> Add Item
          </button>
        </div>
        <div className="divide-y divide-glass-border shrink-0">
          {lineItems.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-text-muted">No line items available.</div>
          ) : (
            lineItems.map((item, index) => (
              <div key={item.id} className="flex gap-4 px-5 py-4 transition hover:bg-surface-hover/50">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <input type="text" {...register(`line_items.${index}.description` as const)} className="w-full min-w-0 bg-transparent text-sm font-semibold text-text-primary placeholder:text-text-muted focus:outline-none" placeholder="Item description" />
                    <div className="min-w-[70px] shrink-0 font-mono text-sm font-bold text-champagne text-right">${safeNumber(formData.line_items?.[index]?.line_total).toFixed(2)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-text-muted">
                    <div className="flex items-center gap-1.5">
                      <span>Qty:</span>
                      <input type="number" min="0" step="1" {...register(`line_items.${index}.quantity` as const, { valueAsNumber: true })} className="w-12 rounded border border-transparent bg-surface-raised px-1 py-0.5 text-text-secondary focus:border-glass-border focus:outline-none" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>Unit:</span>
                      <input type="number" min="0" step="0.01" {...register(`line_items.${index}.unit_price` as const, { valueAsNumber: true })} className="w-16 rounded border border-transparent bg-surface-raised px-1 py-0.5 text-text-secondary focus:border-glass-border focus:outline-none" />
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => remove(index)} className="shrink-0 self-start text-text-muted transition hover:text-red-400 p-1">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Real-Time Scores */}
      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-3xl border border-glass-border bg-surface-raised px-5 py-4">
            <div className="flex items-center gap-2 text-text-muted">
              <Hash className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">AI confidence</span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-text-primary">{safeNumber(formData.confidence_score)}</p>
          </div>
          <div className="rounded-3xl border border-glass-border bg-surface-raised px-5 py-4">
            <div className="flex items-center gap-2 text-text-muted">
              <FileText className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">CRA readiness</span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-champagne">{liveCRAScore}</p>
          </div>
        </div>

        {/* CRA Score Bar (Live) */}
        <div className="rounded-2xl border border-glass-border bg-surface-raised px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">CRA Readiness</p>
            <p className="text-xs font-bold tabular-nums text-champagne">{liveCRAScore}/100</p>
          </div>
          <div className="h-2 w-full rounded-full bg-obsidian overflow-hidden">
            <div
              className={`h-full rounded-full cra-score-bar ${craScoreColor(liveCRAScore)}`}
              style={{ width: `${liveCRAScore}%` }}
            />
          </div>
        </div>
      </section>

      {/* Confirmation & Save */}
      {/* Confirmation & Save (Sticky Bottom Bar) */}
      <div className="sticky bottom-0 z-40 -mx-5 -mb-5 border-t border-glass-border bg-obsidian/95 p-5 pb-safe-bottom backdrop-blur-xl shadow-[0_-10px_30px_rgba(0,0,0,0.6)] sm:rounded-b-3xl">
        <div className="mx-auto max-w-lg space-y-4">
          <button 
            type="button" 
            onClick={() => setIsConfirmed((v) => !v)} 
            className={['flex w-full items-start gap-4 rounded-3xl border p-4 text-left transition', isConfirmed ? 'border-champagne/40 bg-champagne/[0.08]' : 'border-glass-border bg-surface-raised hover:border-glass-border-hover'].join(' ')}
          >
            <div className={['mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition', isConfirmed ? 'border-champagne bg-champagne text-obsidian' : 'border-text-muted bg-surface'].join(' ')}>
              {isConfirmed && <CheckCircle2 className="h-3.5 w-3.5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-primary">I confirm that these figures are accurate.</p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-text-muted">Required by CRA Compliance</p>
            </div>
          </button>

          {hasAnalyzed && (
            <div className="pt-1">
              <button 
                type="submit" 
                disabled={saving || !isConfirmed} 
                className="inline-flex h-14 w-full items-center justify-center rounded-[2rem] bg-emerald-success px-6 text-base font-black text-white transition hover:bg-emerald-success/80 disabled:cursor-not-allowed disabled:opacity-40 shadow-xl shadow-emerald-success/20"
              >
                {saving ? (
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Saving to Vault…</span>
                  </div>
                ) : (
                  'Save Verified Record'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}