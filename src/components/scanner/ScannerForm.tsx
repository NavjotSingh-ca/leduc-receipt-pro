'use client';

import { AlertTriangle, FileText, Hash, Plus, Trash2 } from 'lucide-react';

import type { ReceiptForm, ReceiptLineItem, ScannerFormProps } from './types';
import {
  CATEGORIES,
  PAYMENT_METHODS,
  USAGE_TYPES,
  createBlankReceiptLineItem,
} from './types';

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100';

const warningInputCls =
  'w-full rounded-xl border border-yellow-400 bg-yellow-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-yellow-500 focus:ring-2 focus:ring-yellow-100';

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
  const lineItems = Array.isArray(formData.line_items) ? formData.line_items : [];

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
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-base font-bold text-slate-900">Review extracted data</h3>
        <p className="mt-1 text-sm text-slate-500">
          Verify the OCR results and complete any missing CRA-relevant fields.
        </p>
      </div>

      <div className="space-y-5 p-5">
        {(missingBN || mathMismatch || thermalWarning || lowReadiness) && (
          <div className="space-y-3">
            {missingBN && (
              <div className="rounded-2xl border border-yellow-300 bg-yellow-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600" />
                  <div>
                    <p className="text-sm font-bold text-yellow-800">Missing GST / Business Number</p>
                    <p className="mt-1 text-xs leading-relaxed text-yellow-700">
                      CRA claims are harder to support when the supplier GST/BN is missing. Review the
                      receipt and enter the supplier number if visible.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {mathMismatch && (
              <div className="rounded-2xl border border-yellow-300 bg-yellow-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600" />
                  <div>
                    <p className="text-sm font-bold text-yellow-800">Amount mismatch warning</p>
                    <p className="mt-1 text-xs leading-relaxed text-yellow-700">
                      The subtotal plus taxes does not match the total within expected rounding tolerance.
                      Please confirm the numbers before saving.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {thermalWarning && (
              <div className="rounded-2xl border border-yellow-300 bg-yellow-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600" />
                  <div>
                    <p className="text-sm font-bold text-yellow-800">Thermal receipt warning</p>
                    <p className="mt-1 text-xs leading-relaxed text-yellow-700">
                      This appears to be a thermal receipt. Save and back it up promptly because the print may fade.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {lowReadiness && (
              <div className="rounded-2xl border border-yellow-300 bg-yellow-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600" />
                  <div>
                    <p className="text-sm font-bold text-yellow-800">Low CRA readiness</p>
                    <p className="mt-1 text-xs leading-relaxed text-yellow-700">
                      The extracted record may still be incomplete. Double-check vendor, taxes, date,
                      business purpose, and job-specific metadata.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <section className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Vendor</p>

          <div className="grid gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
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
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
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
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
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

        <section className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Amounts</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Subtotal
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.subtotal}
                onChange={(e) => patchNumber('subtotal', e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Total
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.total_amount}
                onChange={(e) => patchNumber('total_amount', e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                GST
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.tax_amount}
                onChange={(e) => patchNumber('tax_amount', e.target.value)}
                className={missingBN ? warningInputCls : inputCls}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                PST / HST provincial portion
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.pst_amount}
                onChange={(e) => patchNumber('pst_amount', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Transaction</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Date
              </label>
              <input
                type="date"
                value={formData.transaction_date}
                onChange={(e) => patch('transaction_date', e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Time
              </label>
              <input
                type="time"
                value={formData.transaction_time}
                onChange={(e) => patch('transaction_time', e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Payment method
              </label>
              <select
                value={formData.payment_method}
                onChange={(e) => patch('payment_method', e.target.value)}
                className={inputCls}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Card last four
              </label>
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
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Payment reference
              </label>
              <input
                type="text"
                value={formData.payment_reference}
                onChange={(e) => patch('payment_reference', e.target.value)}
                className={inputCls}
                placeholder="Approval or reference number"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Currency
              </label>
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

        <section className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Classification</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => patch('category', e.target.value)}
                className={inputCls}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Usage type
              </label>
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
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Business use %
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={formData.business_use_percent}
                onChange={(e) => patchNumber('business_use_percent', e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Business unit
              </label>
              <select
                value={formData.business_unit_id}
                onChange={(e) => patch('business_unit_id', e.target.value)}
                className={inputCls}
              >
                <option value="">Unassigned</option>
                {businessUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Job code
              </label>
              <input
                type="text"
                value={formData.job_code}
                onChange={(e) => patch('job_code', e.target.value)}
                className={inputCls}
                placeholder="JOB-1042"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Vehicle ID
              </label>
              <input
                type="text"
                value={formData.vehicle_id}
                onChange={(e) => patch('vehicle_id', e.target.value)}
                className={inputCls}
                placeholder="Truck 12"
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Line items</p>
            <button
              type="button"
              onClick={addLineItem}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add line item
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
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
                <tbody className="divide-y divide-slate-100 bg-white">
                  {lineItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-400">
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
                            type="number"
                            min="0"
                            step="1"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(index, { quantity: safeNumber(e.target.value) })}
                            className={inputCls}
                          />
                        </td>

                        <td className="px-3 py-3 align-top">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateLineItem(index, { unit_price: safeNumber(e.target.value) })}
                            className={inputCls}
                          />
                        </td>

                        <td className="px-3 py-3 align-top">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.tax_rate}
                            onChange={(e) => updateLineItem(index, { tax_rate: safeNumber(e.target.value) })}
                            className={inputCls}
                          />
                        </td>

                        <td className="px-3 py-3 align-top">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
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
                          <div className="min-w-[88px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-right font-semibold text-slate-700">
                            {safeNumber(item.line_total).toFixed(2)}
                          </div>
                        </td>

                        <td className="px-3 py-3 align-top">
                          <button
                            type="button"
                            onClick={() => removeLineItem(index)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-red-50 hover:text-red-600"
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

        <section className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Notes</p>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
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

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2 text-slate-600">
              <Hash className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">AI confidence</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{safeNumber(formData.confidence_score)}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2 text-slate-600">
              <FileText className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">CRA readiness</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{safeNumber(formData.cra_readiness_score)}</p>
          </div>
        </section>

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving receipt...' : 'Save receipt'}
        </button>
      </div>
    </div>
  );
}