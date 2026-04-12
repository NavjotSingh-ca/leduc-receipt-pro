'use client';

import { AlertTriangle, Ban, CopyCheck } from 'lucide-react';

import type { DuplicateModalProps } from './types';

function formatCurrency(amount: number | null | undefined) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(Number(amount ?? 0));
}

function formatDate(date: string | null | undefined) {
  if (!date) return 'Unknown date';

  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function DuplicateModal({
  candidate,
  onCancel,
  onContinue,
}: DuplicateModalProps) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-yellow-100 text-yellow-700">
              <AlertTriangle className="h-5 w-5" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">Possible duplicate receipt</h3>
              <p className="mt-1 text-sm text-slate-500">
                A matching receipt was found using the SHA-256 file hash or the vendor/date/amount fingerprint.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Existing record</p>

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vendor</p>
                <p className="mt-1 font-semibold text-slate-900">{candidate.vendor_name}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</p>
                <p className="mt-1 font-semibold text-slate-900">{formatDate(candidate.transaction_date)}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total</p>
                <p className="mt-1 font-semibold text-slate-900">{formatCurrency(candidate.total_amount)}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</p>
                <p className="mt-1 font-semibold text-slate-900">{candidate.category || 'Uncategorized'}</p>
              </div>
            </div>

            {candidate.integrity_hash && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">SHA-256 hash</p>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-700">{candidate.integrity_hash}</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3">
            <div className="flex items-start gap-3">
              <CopyCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-700" />
              <p className="text-sm leading-relaxed text-yellow-800">
                If this is a separate receipt that only looks similar, you can still save it. Otherwise, cancel and
                review the existing record first.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Ban className="h-4 w-4" />
            Cancel
          </button>

          <button
            type="button"
            onClick={onContinue}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <CopyCheck className="h-4 w-4" />
            Save anyway
          </button>
        </div>
      </div>
    </div>
  );
}