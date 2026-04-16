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
      className="fixed inset-0 z-[110] flex items-center justify-center bg-obsidian/80 p-4 backdrop-blur-xl"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-glass-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-glass-border px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>

            <div>
              <h3 className="text-base font-bold text-text-primary">Possible duplicate receipt</h3>
              <p className="mt-1 text-sm text-text-secondary">
                A matching receipt was found using the SHA-256 file hash or the vendor/date/amount fingerprint.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-2xl border border-glass-border bg-surface-raised p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">Existing record</p>

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Vendor</p>
                <p className="mt-1 font-semibold text-text-primary">{candidate.vendor_name}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Date</p>
                <p className="mt-1 font-semibold text-text-primary">{formatDate(candidate.transaction_date)}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Total</p>
                <p className="mt-1 font-semibold tabular-nums text-champagne">{formatCurrency(candidate.total_amount)}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Category</p>
                <p className="mt-1 font-semibold text-text-primary">{candidate.category || 'Uncategorized'}</p>
              </div>
            </div>

            {candidate.integrity_hash && (
              <div className="mt-4 rounded-xl border border-glass-border bg-surface p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">SHA-256 hash</p>
                <p className="mt-1 break-all font-mono text-[11px] text-text-secondary">{candidate.integrity_hash}</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
            <div className="flex items-start gap-3">
              <CopyCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
              <p className="text-sm leading-relaxed text-amber-300">
                If this is a separate receipt that only looks similar, you can still save it. Otherwise, cancel and
                review the existing record first.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-glass-border px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-glass-border bg-surface px-4 py-3 text-sm font-semibold text-text-secondary transition hover:bg-surface-raised"
          >
            <Ban className="h-4 w-4" />
            Cancel
          </button>

          <button
            type="button"
            onClick={onContinue}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-success px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-success/80"
          >
            <CopyCheck className="h-4 w-4" />
            Save anyway
          </button>
        </div>
      </div>
    </div>
  );
}