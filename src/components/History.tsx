'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  ChevronRight,
  CreditCard,
  Edit3,
  Eye,
  Fingerprint,
  Loader2,
  MapPin,
  Receipt,
  RefreshCw,
  Save,
  Search,
  Tag,
  X,
} from 'lucide-react';

import type { ReceiptRow } from '@/lib/types';
import { supabase } from '@/lib/supabase';

type HistoryProps = {
  receipts: ReceiptRow[];
  activeFilter?: string;
  onUpdate?: () => Promise<void> | void;
};

function toNumber(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(value: number, currency = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currency || 'CAD',
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDate(value?: string | null): string {
  if (!value) return 'No date';
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return value;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function categoryColor(category?: string): string {
  const map: Record<string, string> = {
    'Office Supplies': '#bea98e',
    'Meals Entertainment': '#f59e0b',
    Travel: '#8b5cf6',
    Fuel: '#ef4444',
    'Professional Fees': '#10b981',
    Supplies: '#06b6d4',
    'Software Subscriptions': '#ec4899',
    Utilities: '#f97316',
    'General Expense': '#6b6560',
  };
  return map[category ?? ''] ?? '#6b6560';
}

function confidenceTone(score: number) {
  if (score >= 85) {
    return {
      pill: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
      panel: 'bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-300',
      label: 'High',
    };
  }
  if (score >= 60) {
    return {
      pill: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
      panel: 'bg-amber-500/[0.06] border-amber-500/20 text-amber-300',
      label: 'Medium',
    };
  }
  return {
    pill: 'bg-red-500/15 text-red-400 border-red-500/20',
    panel: 'bg-red-500/[0.06] border-red-500/20 text-red-300',
    label: 'Low',
  };
}

export default function History({
  receipts,
  activeFilter = 'all',
  onUpdate,
}: HistoryProps) {
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRow | null>(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filteredReceipts = useMemo(() => {
    let items = [...receipts];
    const normalizedFilter = activeFilter.toLowerCase();

    if (normalizedFilter !== 'all') {
      if (normalizedFilter === 'missing' || normalizedFilter === 'missing-bn') {
        items = items.filter(
          (r) =>
            !String(r.vendor_tax_number ?? '').trim() ||
            !String(r.vendor_name ?? '').trim() ||
            !String(r.transaction_date ?? '').trim() ||
            toNumber(r.total_amount) <= 0
        );
      } else if (normalizedFilter === 'approved') {
        items = items.filter((r) => toNumber(r.confidence_score) >= 85);
      } else if (normalizedFilter === 'review' || normalizedFilter === 'pending-review') {
        items = items.filter((r) => toNumber(r.confidence_score) < 85);
      } else if (normalizedFilter === 'flagged-audit') {
        items = items.filter(
          (r) =>
            r.flagged_for_audit ||
            r.math_mismatch_warning ||
            r.duplicate_warning ||
            r.thermal_warning ||
            (toNumber(r.cra_readiness_score) > 0 && toNumber(r.cra_readiness_score) < 70)
        );
      } else {
        items = items.filter(
          (r) => (r.category ?? 'Uncategorized').toLowerCase() === normalizedFilter
        );
      }
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((r) => {
        const fields = [
          r.vendor_name ?? '',
          r.vendor_address ?? '',
          r.vendor_tax_number ?? '',
          r.transaction_date ?? '',
          r.category ?? '',
          r.notes ?? '',
          r.payment_method ?? '',
          r.card_last_four ?? '',
          r.job_code ?? '',
          r.vehicle_id ?? '',
          r.id,
        ];
        return fields.some((value) => value.toLowerCase().includes(q));
      });
    }

    return items;
  }, [receipts, activeFilter, search]);

  const handleRefresh = async () => {
    if (!onUpdate) return;
    try {
      setRefreshing(true);
      await onUpdate();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <div className="space-y-4 fade-in">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Receipts</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              {filteredReceipts.length} record{filteredReceipts.length === 1 ? '' : 's'} shown
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-glass-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary shadow-sm transition hover:border-glass-border-hover hover:text-champagne disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="rounded-2xl border border-glass-border bg-surface p-3 shadow-sm">
          <div className="flex items-center gap-3 rounded-xl border border-glass-border bg-surface-raised px-3 py-2.5">
            <Search className="h-4 w-4 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendor, date, BN, amount, category..."
              className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
        </div>

        {filteredReceipts.length === 0 ? (
          <div className="rounded-3xl border border-glass-border bg-surface p-12 text-center shadow-sm">
            <Receipt className="mx-auto mb-3 h-12 w-12 text-text-muted/30" />
            <p className="text-sm font-medium text-text-secondary">
              {receipts.length === 0
                ? 'No receipts yet. Scan your first receipt to get started.'
                : 'No receipts match your current filter or search.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReceipts.map((receipt) => {
              const tone = confidenceTone(toNumber(receipt.confidence_score));
              const vendor = receipt.vendor_name ?? 'Unknown Vendor';
              const total = toNumber(receipt.total_amount);
              const category = receipt.category ?? 'Uncategorized';
              const cardLastFour = receipt.card_last_four ?? '';
              const hasHash = Boolean(receipt.integrity_hash);
              const missingBN = !String(receipt.vendor_tax_number ?? '').trim();

              return (
                <button
                  key={receipt.id}
                  type="button"
                  onClick={() => setSelectedReceipt(receipt)}
                  className="w-full rounded-2xl border border-glass-border bg-surface p-4 text-left shadow-sm transition hover:border-glass-border-hover hover:bg-surface-raised"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold text-obsidian"
                      style={{ backgroundColor: categoryColor(category) }}
                    >
                      {vendor.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-text-primary">{vendor}</p>

                        {hasHash && (
                          <span title="SHA-256 integrity hash stored">
                            <Fingerprint className="h-3.5 w-3.5 text-emerald-light" />
                          </span>
                        )}

                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.pill}`}
                        >
                          {tone.label} AI
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        <span>{formatDate(receipt.transaction_date)}</span>
                        <span className="h-1 w-1 rounded-full bg-text-muted/30" />
                        <span>{category}</span>
                        {cardLastFour && (
                          <>
                            <span className="h-1 w-1 rounded-full bg-text-muted/30" />
                            <span>•••• {cardLastFour}</span>
                          </>
                        )}
                        {missingBN && (
                          <>
                            <span className="h-1 w-1 rounded-full bg-text-muted/30" />
                            <span className="font-medium text-amber-400">Missing GST/BN</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span className="text-sm font-bold tabular-nums text-champagne">
                        {formatCurrency(total, receipt.currency ?? 'CAD')}
                      </span>
                      <ChevronRight className="h-4 w-4 text-text-muted" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedReceipt && (
        <ReceiptDetailModal
          receipt={selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </>
  );
}

/* ─── Detail Modal ─── */

type ReceiptDetailModalProps = {
  receipt: ReceiptRow;
  onClose: () => void;
};

function ReceiptDetailModal({ receipt, onClose }: ReceiptDetailModalProps) {
  const score = toNumber(receipt.confidence_score);
  const tone = confidenceTone(score);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(receipt.notes ?? '');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState(false);

  /**
   * Archive-before-update: writes the current row to receipt_history,
   * then updates receipts. If the archive insert fails, the update
   * is never attempted (Legal Fortress immutable-history pattern).
   */
  async function handleSaveEdit() {
    setEditSaving(true);
    setEditError('');
    setEditSuccess(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Step 1 — Archive the current version FIRST
      const { error: archiveError } = await supabase
        .from('receipt_history')
        .insert({
          receipt_id:     receipt.id,
          vendor_name:    receipt.vendor_name,
          transaction_date: receipt.transaction_date,
          total_amount:   receipt.total_amount,
          category:       receipt.category,
          notes:          receipt.notes,
          duplicate_hash: receipt.duplicate_hash,
          integrity_hash: receipt.integrity_hash,
          archived_at:    new Date().toISOString(),
          archived_by:    user?.id ?? 'system',
        });

      if (archiveError) {
        throw new Error(`History archive failed — update aborted: ${archiveError.message}`);
      }

      // Step 2 — Update ONLY after successful archive
      const { error: updateError } = await supabase
        .from('receipts')
        .update({ notes: notesValue, updated_at: new Date().toISOString() })
        .eq('id', receipt.id);

      if (updateError) throw new Error(updateError.message);

      // Step 3 — Record to Audit Logs
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action: 'receiptedited',
        details: `Receipt updated: Notes modified for ${receipt.vendor_name}. Previous version archived to history.`,
      });

      setEditSuccess(true);
      setEditingNotes(false);
    } catch (err: any) {
      setEditError(err?.message ?? 'Edit failed.');
    } finally {
      setEditSaving(false);
    }
  }

  const rows = [
    {
      label: 'Date',
      value: formatDate(receipt.transaction_date),
      icon: <CalendarDays className="h-4 w-4" />,
    },
    receipt.transaction_time
      ? {
          label: 'Time',
          value: receipt.transaction_time,
          icon: <CalendarDays className="h-4 w-4" />,
        }
      : null,
    {
      label: 'Category',
      value: receipt.category ?? 'Uncategorized',
      icon: <Tag className="h-4 w-4" />,
    },
    {
      label: 'Subtotal',
      value: formatCurrency(toNumber(receipt.subtotal), receipt.currency ?? 'CAD'),
      icon: <Receipt className="h-4 w-4" />,
    },
    {
      label: 'GST',
      value: formatCurrency(toNumber(receipt.tax_amount), receipt.currency ?? 'CAD'),
      icon: <Receipt className="h-4 w-4" />,
    },
    {
      label: 'PST/HST',
      value: formatCurrency(toNumber(receipt.pst_amount), receipt.currency ?? 'CAD'),
      icon: <Receipt className="h-4 w-4" />,
    },
    {
      label: 'Total',
      value: formatCurrency(toNumber(receipt.total_amount), receipt.currency ?? 'CAD'),
      icon: <Receipt className="h-4 w-4" />,
    },
    {
      label: 'Payment',
      value: [
        receipt.payment_method ?? '',
        receipt.card_last_four ? `•••• ${receipt.card_last_four}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      icon: <CreditCard className="h-4 w-4" />,
    },
    receipt.vendor_address
      ? {
          label: 'Address',
          value: receipt.vendor_address,
          icon: <MapPin className="h-4 w-4" />,
        }
      : null,
    receipt.vendor_tax_number
      ? {
          label: 'Business Number',
          value: receipt.vendor_tax_number,
          icon: <Fingerprint className="h-4 w-4" />,
        }
      : null,
    receipt.job_code
      ? {
          label: 'Job Code',
          value: receipt.job_code,
          icon: <Tag className="h-4 w-4" />,
        }
      : null,
    receipt.vehicle_id
      ? {
          label: 'Vehicle ID',
          value: receipt.vehicle_id,
          icon: <Tag className="h-4 w-4" />,
        }
      : null,
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    icon: React.ReactNode;
  }>;

  const imageUrl = receipt.image_url ?? '';
  const integrityHash = receipt.integrity_hash ?? '';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-xl sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-glass-border bg-surface shadow-2xl sm:max-w-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-glass-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-text-primary">
              {receipt.vendor_name ?? 'Unknown Vendor'}
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">
              {formatDate(receipt.transaction_date)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-text-muted transition hover:bg-surface-raised hover:text-text-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {imageUrl ? (
            <div className="border-b border-glass-border bg-obsidian">
              <img
                src={imageUrl}
                alt="Receipt"
                className="max-h-80 w-full object-contain"
              />
            </div>
          ) : (
            <div className="border-b border-glass-border bg-surface-raised px-5 py-8 text-center">
              <Eye className="mx-auto mb-2 h-8 w-8 text-text-muted/30" />
              <p className="text-sm text-text-muted">No image preview available.</p>
            </div>
          )}

          <div className="space-y-5 p-5">
            <div className={`rounded-2xl border px-4 py-3 ${tone.panel}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wide">AI Confidence</p>
                <p className="text-sm font-bold tabular-nums">{score}</p>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed">
                {score >= 85
                  ? 'Strong extraction quality. Still verify totals, tax fields, and business number before filing.'
                  : score >= 60
                  ? 'Some fields may need review. Check vendor, tax split, and missing identifiers.'
                  : 'Low confidence result. Review all fields carefully before relying on this receipt.'}
              </p>
            </div>

            {!receipt.vendor_tax_number && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                  <p className="text-xs leading-relaxed text-amber-300">
                    GST/BN is missing on this receipt. Review before claiming input tax credits.
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-glass-border bg-surface-raised">
              <div className="border-b border-glass-border px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-text-muted">
                  Receipt details
                </p>
              </div>

              <div className="px-4 py-2">
                {rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-start justify-between gap-4 border-b border-glass-border py-3 last:border-0"
                  >
                    <div className="flex items-center gap-2 text-text-muted">
                      {row.icon}
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        {row.label}
                      </span>
                    </div>
                    <span className="max-w-[58%] break-words text-right text-sm font-semibold tabular-nums text-text-primary">
                      {row.value || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {receipt.notes && (
              <div className="rounded-2xl border border-champagne/15 bg-champagne/[0.04] p-4">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-champagne">
                  Business purpose
                </p>
                <p className="text-sm text-text-secondary">{receipt.notes}</p>
              </div>
            )}

            {integrityHash && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-emerald-light" />
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-light">
                    SHA-256 integrity hash
                  </p>
                </div>
                <p className="break-all font-mono text-[11px] leading-relaxed text-emerald-300">
                  {integrityHash}
                </p>
              </div>
            )}

            {/* ── Legal Fortress: Archive-before-update Notes Edit ── */}
            <div className="rounded-2xl border border-glass-border bg-surface-raised">
              <div className="flex items-center justify-between gap-3 border-b border-glass-border px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-text-muted">Business purpose</p>
                {!editingNotes && (
                  <button
                    type="button"
                    onClick={() => { setEditingNotes(true); setEditSuccess(false); setEditError(''); }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-glass-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition hover:border-glass-border-hover hover:text-champagne"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
              </div>

              <div className="p-4">
                {editingNotes ? (
                  <div className="space-y-3">
                    <textarea
                      rows={4}
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      className="w-full resize-none rounded-xl border border-glass-border bg-surface px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-champagne/40 focus:ring-2 focus:ring-champagne/15"
                      placeholder="Describe the business purpose of this expense."
                    />
                    {editError && (
                      <p className="text-xs text-red-400">{editError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={editSaving}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-success px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-success/80 disabled:opacity-60"
                      >
                        {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {editSaving ? 'Archiving & saving…' : 'Save edit'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingNotes(false); setNotesValue(receipt.notes ?? ''); setEditError(''); }}
                        className="rounded-xl border border-glass-border bg-surface px-3 py-2.5 text-sm font-semibold text-text-secondary transition hover:bg-surface-raised"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-[11px] leading-5 text-text-muted">
                      The current version will be archived to <span className="font-mono text-champagne">receipt_history</span> before this update is applied.
                    </p>
                  </div>
                ) : (
                  <>
                    {editSuccess && (
                      <p className="mb-2 text-xs font-medium text-emerald-light">Edit saved and previous version archived.</p>
                    )}
                    <p className="text-sm text-text-secondary">{notesValue || <span className="italic text-text-muted">No business purpose recorded.</span>}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}