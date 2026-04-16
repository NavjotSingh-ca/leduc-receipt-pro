'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, FileText, Hash, Plus, Trash2 } from 'lucide-react';

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
}: ScannerFormProps) {
  const [refineOpen, setRefineOpen] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const lineItems = Array.isArray(formData.line_items) ? formData.line_items : [];

  // Reset the confirmation checkbox whenever a new scan loads (vendor or date changes)
  useEffect(() => {
    setIsConfirmed(false);
  }, [formData.vendor_name, formData.transaction_date]);

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
    <div className="rounded-3xl border border-glass-border bg-surface shadow-sm">
      <div className="border-b border-glass-border px-5 py-4">
        <h3 className="text-base font-bold text-text-primary">Review extracted data</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Verify the OCR results and complete any missing CRA-relevant fields.
        </p>
      </div>

      <div className="space-y-5 p-5">
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
                      CRA claims are harder to support when the supplier GST/BN is missing. Review the
                      receipt and enter the supplier number if visible.
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
                    <p className="text-sm font-bold text-amber-300">Amount mismatch warning</p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-400/80">
                      The subtotal plus taxes does not match the total within expected rounding tolerance.
                      Please confirm the numbers before saving.
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
                      This appears to be a thermal receipt. Save and back it up promptly because the print may fade.
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
                      The extracted record may still be incomplete. Double-check vendor, taxes, date,
                      business purpose, and job-specific metadata.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Vendor */}
        <section className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">Vendor</p>

          <div className="grid gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">
                Vendor name
              </label>
              <input
                type="text"
                value={formData.vendor_name}
                onChange={(e) => patch('vendor_name', e.target.value)}
                className={inputCls}
                placeholder="Supplier name"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">
                Vendor address
              </label>
              <input
                type="text"
                value={formData.vendor_address}
                onChange={(e) => patch('vendor_address', e.target.value)}
                className={inputCls}
                placeholder="123 Main St, Calgary, AB"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">
                GST / business number
              </label>
              <input
                type="text"
                value={formData.business_number}
                onChange={(e) => patch('business_number', e.target.value.toUpperCase())}
                className={missingBN ? warningInputCls : inputCls}
                placeholder="123456789RT0001"
              />
            </div>
          </div>
        </section>

        {/* Amounts */}
        <section className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">Amounts</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Subtotal</label>
              <input
                type="number" step="0.01" min="0"
                value={formData.subtotal}
                onChange={(e) => patchNumber('subtotal', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Total</label>
              <input
                type="number" step="0.01" min="0"
                value={formData.total_amount}
                onChange={(e) => patchNumber('total_amount', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">GST</label>
              <input
                type="number" step="0.01" min="0"
                value={formData.tax_amount}
                onChange={(e) => patchNumber('tax_amount', e.target.value)}
                className={missingBN ? warningInputCls : inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">PST / HST provincial portion</label>
              <input
                type="number" step="0.01" min="0"
                value={formData.pst_amount}
                onChange={(e) => patchNumber('pst_amount', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        </section>

        {/* Transaction */}
        <section className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">Transaction</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Date</label>
              <input
                type="date"
                value={formData.transaction_date}
                onChange={(e) => patch('transaction_date', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Time</label>
              <input
                type="time"
                value={formData.transaction_time}
                onChange={(e) => patch('transaction_time', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Payment method</label>
              <select
                value={formData.payment_method}
                onChange={(e) => patch('payment_method', e.target.value)}
                className={inputCls}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Card last four</label>
              <input
                type="text"
                maxLength={4}
                value={formData.card_last_four}
                onChange={(e) => patch('card_last_four', e.target.value.replace(/\D/g, '').slice(0, 4))}
                className={inputCls}
                placeholder="1234"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Payment reference</label>
              <input
                type="text"
                value={formData.payment_reference}
                onChange={(e) => patch('payment_reference', e.target.value)}
                className={inputCls}
                placeholder="Approval or reference number"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Currency</label>
              <input
                type="text"
                value={formData.currency}
                onChange={(e) => patch('currency', e.target.value.toUpperCase())}
                className={inputCls}
                placeholder="CAD"
              />
            </div>
          </div>
        </section>

        {/* Classification */}
        <section className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">Classification</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Category</label>
              <select
                value={formData.category}
                onChange={(e) => patch('category', e.target.value)}
                className={inputCls}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Usage type</label>
              <select
                value={formData.usage_type}
                onChange={(e) => patch('usage_type', e.target.value as ReceiptForm['usage_type'])}
                className={inputCls}
              >
                {USAGE_TYPES.map((usageType) => (
                  <option key={usageType} value={usageType}>
                    {usageType.charAt(0).toUpperCase() + usageType.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Business use %</label>
              <input
                type="number" min="0" max="100"
                value={formData.business_use_percent}
                onChange={(e) => patchNumber('business_use_percent', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        </section>

        {/* Refine Audit — Collapsible Progressive Disclosure */}
        <section className="rounded-2xl border border-glass-border">
          <button
            type="button"
            onClick={() => setRefineOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-surface-raised"
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">
              Refine Audit
            </span>
            <ChevronDown
              className={`h-4 w-4 text-text-muted transition ${refineOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {refineOpen && (
            <div className="border-t border-glass-border px-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Job code</label>
                  <input
                    type="text"
                    value={formData.job_code}
                    onChange={(e) => patch('job_code', e.target.value)}
                    className={inputCls}
                    placeholder="JOB-1042"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Vehicle ID</label>
                  <input
                    type="text"
                    value={formData.vehicle_id}
                    onChange={(e) => patch('vehicle_id', e.target.value)}
                    className={inputCls}
                    placeholder="Truck 12"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Business unit</label>
                  <select
                    value={formData.business_unit_id}
                    onChange={(e) => patch('business_unit_id', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Unassigned</option>
                    {businessUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>{unit.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Line Items */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">Line items</p>
            <button
              type="button"
              onClick={addLineItem}
              className="inline-flex items-center gap-2 rounded-xl border border-glass-border bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition hover:bg-surface-raised hover:text-text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              Add line item
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-glass-border">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-raised">
                  <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                    <th className="px-3 py-3">Description</th>
                    <th className="px-3 py-3">Qty</th>
                    <th className="px-3 py-3">Unit</th>
                    <th className="px-3 py-3">Tax %</th>
                    <th className="px-3 py-3">Tax</th>
                    <th className="px-3 py-3">Category</th>
                    <th className="px-3 py-3">Total</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-glass-border bg-surface">
                  {lineItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-sm text-text-muted">
                        No line items added yet.
                      </td>
                    </tr>
                  ) : (
                    lineItems.map((item, index) => (
                      <tr key={index}>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateLineItem(index, { description: e.target.value })}
                            className={inputCls}
                            placeholder="Item description"
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="number" min="0" step="1"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(index, { quantity: safeNumber(e.target.value) })}
                            className={inputCls}
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="number" min="0" step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateLineItem(index, { unit_price: safeNumber(e.target.value) })}
                            className={inputCls}
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="number" min="0" step="0.01"
                            value={item.tax_rate}
                            onChange={(e) => updateLineItem(index, { tax_rate: safeNumber(e.target.value) })}
                            className={inputCls}
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="number" min="0" step="0.01"
                            value={item.tax_amount}
                            onChange={(e) => updateLineItem(index, { tax_amount: safeNumber(e.target.value) })}
                            className={inputCls}
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="text"
                            value={item.category}
                            onChange={(e) => updateLineItem(index, { category: e.target.value })}
                            className={inputCls}
                            placeholder="Category"
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="min-w-[88px] rounded-xl border border-glass-border bg-surface-raised px-3 py-2.5 text-right font-semibold tabular-nums text-champagne">
                            {safeNumber(item.line_total).toFixed(2)}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <button
                            type="button"
                            onClick={() => removeLineItem(index)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-glass-border bg-surface text-text-muted transition hover:bg-red-500/10 hover:text-red-400"
                            aria-label="Remove line item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Notes */}
        <section className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">Notes</p>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">
              Business purpose / memo
            </label>
            <textarea
              rows={4}
              value={formData.notes}
              onChange={(e) => patch('notes', e.target.value)}
              className={`${inputCls} resize-none`}
              placeholder="Describe the business purpose of this expense."
            />
          </div>
        </section>

        {/* Scores */}
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-glass-border bg-surface-raised px-4 py-3">
            <div className="flex items-center gap-2 text-text-muted">
              <Hash className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">AI confidence</span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-text-primary">{safeNumber(formData.confidence_score)}</p>
          </div>

          <div className="rounded-2xl border border-glass-border bg-surface-raised px-4 py-3">
            <div className="flex items-center gap-2 text-text-muted">
              <FileText className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">CRA readiness</span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-champagne">{safeNumber(formData.cra_readiness_score)}</p>
          </div>
        </section>

        {/* ── Legal Fortress: Confirmation Checkbox Gate ── */}
        <button
          type="button"
          onClick={() => setIsConfirmed((v) => !v)}
          className={[
            'flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition',
            isConfirmed
              ? 'border-champagne/30 bg-champagne/[0.06]'
              : 'border-glass-border bg-surface-raised hover:border-glass-border-hover',
          ].join(' ')}
        >
          <div
            className={[
              'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition',
              isConfirmed
                ? 'border-champagne bg-champagne text-obsidian'
                : 'border-text-muted bg-surface',
            ].join(' ')}
          >
            {isConfirmed && <CheckCircle2 className="h-3.5 w-3.5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary">
              I confirm that these figures are accurate and match the physical receipt.
            </p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              Required before saving. This creates an auditable record.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onSave}
          disabled={saving || !isConfirmed}
          aria-disabled={saving || !isConfirmed}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-success px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-success/80 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving receipt…' : 'Save receipt'}
        </button>
      </div>
    </div>
  );
}