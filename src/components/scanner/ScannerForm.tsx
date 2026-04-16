'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Hash, Plus, Trash2 } from 'lucide-react';

import type { ReceiptForm, ReceiptLineItem, ScannerFormProps } from './types';
import {
  CATEGORIES,
  PAYMENT_METHODS,
  USAGE_TYPES,
  createBlankReceiptLineItem,
} from './types';

const inputCls =
  'w-full rounded-xl border border-glass-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-champagne/40 focus:ring-2 focus:ring-champagne/15';

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

export default function ScannerForm({
  formData,
  setFormData,
  businessUnits,
  saving,
  onSave,
  hasAnalyzed,
}: ScannerFormProps & { hasAnalyzed?: boolean }) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const lineItems = Array.isArray(formData.line_items) ? formData.line_items : [];

  const [lastCheckGroup, setLastCheckGroup] = useState<string>('');

  const currentCheckGroup = `${formData.vendor_name}:${formData.transaction_date}`;
  if (currentCheckGroup !== lastCheckGroup) {
    setLastCheckGroup(currentCheckGroup);
    setIsConfirmed(false);
  }
  const missingBN = !String(formData.business_number ?? '').trim() || Boolean(formData.missing_bn_warning);
  const mathMismatch = Boolean(formData.math_mismatch_warning);
  const thermalWarning = Boolean(formData.thermal_warning);
  const lowReadiness = safeNumber(formData.cra_readiness_score) < 70;

  function patch<K extends keyof ReceiptForm>(key: K, value: ReceiptForm[K]) {
    setFormData({
      ...formData,
      [key]: value,
    });
  }

  function patchNumber<K extends keyof ReceiptForm>(key: K, raw: string) {
    const value = raw === '' ? 0 : Number(raw);
    patch(key, (Number.isFinite(value) ? value : 0) as ReceiptForm[K]);
  }

  function addLineItem() {
    setFormData({
      ...formData,
      line_items: [...lineItems, createBlankReceiptLineItem()],
    });
  }

  function removeLineItem(index: number) {
    setFormData({
      ...formData,
      line_items: lineItems.filter((_, i) => i !== index),
    });
  }

  function updateLineItem(index: number, partial: Partial<ReceiptLineItem>) {
    const next = [...lineItems];
    const current = next[index] ?? createBlankReceiptLineItem();
    next[index] = updateComputedLineTotal({
      ...current,
      ...partial,
    });

    setFormData({
      ...formData,
      line_items: next,
    });
  }

  return (
    <div className="space-y-5 fade-in">
      {/* Header */}
      <div className="rounded-3xl border border-glass-border bg-surface px-5 py-4 shadow-sm">
        <h3 className="text-base font-bold text-text-primary">Review extracted data</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Verify OCR results and complete any missing CRA-relevant fields.
        </p>
      </div>

      {/* Warnings */}
      {(missingBN || mathMismatch || thermalWarning || lowReadiness) && (
        <div className="space-y-3">
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
                  <p className="text-sm font-bold text-amber-300">Amount mismatch</p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-400/80">
                    The subtotal plus taxes does not match the total within expected tolerance.
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
        </div>
      )}

      {/* Card 1: Store Info */}
      <div className="rounded-3xl border border-glass-border bg-surface shadow-sm">
        <div className="border-b border-glass-border px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">1. Store Info</p>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Vendor Name</label>
              <input type="text" value={formData.vendor_name} onChange={(e) => patch('vendor_name', e.target.value)} className={inputCls} placeholder="Supplier name" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Vendor Address</label>
              <input type="text" value={formData.vendor_address} onChange={(e) => patch('vendor_address', e.target.value)} className={inputCls} placeholder="123 Main St, Calgary, AB" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Date</label>
              <input type="date" value={formData.transaction_date} onChange={(e) => patch('transaction_date', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Time</label>
              <input type="time" value={formData.transaction_time} onChange={(e) => patch('transaction_time', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Payment Method</label>
              <select value={formData.payment_method} onChange={(e) => patch('payment_method', e.target.value)} className={inputCls}>
                {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Card end digits</label>
              <input type="text" maxLength={4} value={formData.card_last_four} onChange={(e) => patch('card_last_four', e.target.value.replace(/\D/g, '').slice(0, 4))} className={inputCls} placeholder="1234" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Payment Ref</label>
              <input type="text" value={formData.payment_reference} onChange={(e) => patch('payment_reference', e.target.value)} className={inputCls} placeholder="Approval Code" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Currency</label>
              <input type="text" value={formData.currency} onChange={(e) => patch('currency', e.target.value.toUpperCase())} className={inputCls} placeholder="CAD" />
            </div>
          </div>
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
              <input type="number" step="0.01" min="0" value={formData.subtotal} onChange={(e) => patchNumber('subtotal', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Total</label>
              <input type="number" step="0.01" min="0" value={formData.total_amount} onChange={(e) => patchNumber('total_amount', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">GST Amount</label>
              <input type="number" step="0.01" min="0" value={formData.tax_amount} onChange={(e) => patchNumber('tax_amount', e.target.value)} className={missingBN ? warningInputCls : inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">PST / HST</label>
              <input type="number" step="0.01" min="0" value={formData.pst_amount} onChange={(e) => patchNumber('pst_amount', e.target.value)} className={inputCls} />
            </div>
          </div>
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
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">GST / Vendor Tax Number</label>
              <input type="text" value={formData.business_number} onChange={(e) => patch('business_number', e.target.value.toUpperCase())} className={missingBN ? warningInputCls : inputCls} placeholder="123456789RT0001" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Category</label>
              <select value={formData.category} onChange={(e) => patch('category', e.target.value)} className={inputCls}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Usage Type</label>
              <select value={formData.usage_type} onChange={(e) => patch('usage_type', e.target.value as ReceiptForm['usage_type'])} className={inputCls}>
                {USAGE_TYPES.map((u) => <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Job code</label>
              <input type="text" value={formData.job_code} onChange={(e) => patch('job_code', e.target.value)} className={inputCls} placeholder="JOB-1042" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Vehicle ID</label>
              <input type="text" value={formData.vehicle_id} onChange={(e) => patch('vehicle_id', e.target.value)} className={inputCls} placeholder="Truck 12" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Business unit</label>
              <select value={formData.business_unit_id} onChange={(e) => patch('business_unit_id', e.target.value)} className={inputCls}>
                <option value="">Unassigned</option>
                {businessUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Business purpose / memo</label>
              <textarea rows={3} value={formData.notes} onChange={(e) => patch('notes', e.target.value)} className={`${inputCls} resize-none`} placeholder="Describe the business purpose..." />
            </div>
          </div>
        </div>
      </div>

      {/* High-Density Line Items */}
      <div className="overflow-hidden rounded-3xl border border-glass-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-glass-border px-5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">Line Items</p>
          <button type="button" onClick={addLineItem} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-raised px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition hover:bg-glass-border-hover hover:text-text-primary">
            <Plus className="h-3 w-3" /> Add Item
          </button>
        </div>
        <div className="divide-y divide-glass-border shrink-0">
          {lineItems.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-text-muted">No line items available.</div>
          ) : (
            lineItems.map((item, index) => (
              <div key={index} className="flex gap-4 px-5 py-4 transition hover:bg-surface-hover/50">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <input type="text" value={item.description} onChange={(e) => updateLineItem(index, { description: e.target.value })} className="w-full min-w-0 bg-transparent text-sm font-semibold text-text-primary placeholder:text-text-muted focus:outline-none" placeholder="Item description" />
                    <div className="min-w-[70px] shrink-0 font-mono text-sm font-bold text-champagne text-right">${safeNumber(item.line_total).toFixed(2)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-text-muted">
                    <div className="flex items-center gap-1.5">
                      <span>Qty:</span>
                      <input type="number" min="0" step="1" value={item.quantity} onChange={(e) => updateLineItem(index, { quantity: safeNumber(e.target.value) })} className="w-12 rounded border border-transparent bg-surface-raised px-1 py-0.5 text-text-secondary focus:border-glass-border focus:outline-none" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>Unit:</span>
                      <input type="number" min="0" step="0.01" value={item.unit_price} onChange={(e) => updateLineItem(index, { unit_price: safeNumber(e.target.value) })} className="w-16 rounded border border-transparent bg-surface-raised px-1 py-0.5 text-text-secondary focus:border-glass-border focus:outline-none" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>Tax:</span>
                      <input type="number" min="0" step="0.01" value={item.tax_amount} onChange={(e) => updateLineItem(index, { tax_amount: safeNumber(e.target.value) })} className="w-16 rounded border border-transparent bg-surface-raised px-1 py-0.5 text-text-secondary focus:border-glass-border focus:outline-none" />
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => removeLineItem(index)} className="shrink-0 self-start text-text-muted transition hover:text-red-400 p-1">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Scores */}
      <section className="grid grid-cols-2 gap-4">
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
          <p className="mt-2 text-2xl font-bold tabular-nums text-champagne">{safeNumber(formData.cra_readiness_score)}</p>
        </div>
      </section>

      {/* Confirmation & Save */}
      <div className="space-y-4">
        <button type="button" onClick={() => setIsConfirmed((v) => !v)} className={['flex w-full items-start gap-4 rounded-3xl border p-5 text-left transition', isConfirmed ? 'border-champagne/40 bg-champagne/[0.08]' : 'border-glass-border bg-surface-raised hover:border-glass-border-hover'].join(' ')}>
          <div className={['mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition', isConfirmed ? 'border-champagne bg-champagne text-obsidian' : 'border-text-muted bg-surface'].join(' ')}>
            {isConfirmed && <CheckCircle2 className="h-3.5 w-3.5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary">I confirm that these figures are accurate and match the physical receipt.</p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">Required before saving. This creates an auditable record.</p>
          </div>
        </button>

        {hasAnalyzed && (
          <button type="button" onClick={onSave} disabled={saving || !isConfirmed} className="inline-flex w-full items-center justify-center rounded-3xl bg-emerald-success px-5 py-4 text-sm font-bold text-white transition hover:bg-emerald-success/80 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? 'Saving secure record…' : 'Save verified receipt'}
          </button>
        )}
      </div>
    </div>
  );
}