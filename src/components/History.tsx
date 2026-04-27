'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  DollarSign,
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
  XCircle,
  BrainCircuit,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { semanticSearchAction } from '@/app/actions/semantic-search';
import { updateReceiptApproval, updateReceiptNotes } from '@/lib/services/receipts';

import type { ReceiptRow } from '@/lib/types';
import type { UserRole } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import {
  toNumber,
  formatCurrency,
  formatDate,
  categoryColor,
  confidenceTone,
  approvalBadge,
  reimbursementBadge,
} from '@/lib/ui-utils';

type HistoryProps = {
  receipts: ReceiptRow[];
  activeFilter?: string;
  onUpdate?: () => Promise<void> | void;
  role?: UserRole;
};

/* ─── Card entrance animation (float up) ─── */
const cardVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: Math.min(i * 0.04, 0.4),
      type: 'spring' as const,
      stiffness: 260,
      damping: 20,
    },
  }),
};

export default function History({
  receipts,
  activeFilter = 'all',
  onUpdate,
  role = 'Owner',
}: HistoryProps) {
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRow | null>(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [semanticMode, setSemanticMode] = useState(false);
  const [semanticResults, setSemanticResults] = useState<string[] | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);

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
      } else if (normalizedFilter === 'reimbursement') {
        items = items.filter((r) => r.paid_by === 'employee_cash');
      } else {
        items = items.filter(
          (r) => (r.category ?? 'Uncategorized').toLowerCase() === normalizedFilter
        );
      }
    }

    if (semanticMode && semanticResults) {
      items = items.filter((r) => semanticResults.includes(r.id));
    } else if (!semanticMode && search.trim()) {
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
  }, [receipts, activeFilter, search, semanticMode, semanticResults]);

  const handleSemanticSearch = async () => {
    if (!search.trim()) return;
    setSemanticLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      const userId = session?.user?.id;
      const results = await semanticSearchAction(search.trim(), accessToken, userId);
      setSemanticResults(results.map((r) => r.id));
    } catch (err) {
      console.error(err);
      setSemanticResults([]);
    } finally {
      setSemanticLoading(false);
    }
  };

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

        {/* Global Search Bar */}
        <div className="rounded-2xl border border-glass-border bg-surface p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 transition ${semanticMode ? 'border-champagne/40 bg-champagne/5' : 'border-glass-border bg-surface-raised'}`}>
              <button 
                type="button" 
                onClick={() => { setSemanticMode(!semanticMode); setSemanticResults(null); }}
                className={`transition ${semanticMode ? 'text-champagne' : 'text-text-muted hover:text-text-secondary'}`}
                title={semanticMode ? "Semantic Search Active" : "Enable Semantic AI Search"}
              >
                <BrainCircuit className="h-5 w-5" />
              </button>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (semanticMode) setSemanticResults(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && semanticMode) {
                    handleSemanticSearch();
                  }
                }}
                placeholder={semanticMode ? "Ask AI (e.g. 'Coffee with clients in Calgary'). Press Enter to search." : "Search vendor, date, BN, notes..."}
                className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              />
              {semanticLoading && <Loader2 className="h-4 w-4 animate-spin text-champagne" />}
              {search && !semanticLoading && (
                <button type="button" onClick={() => { setSearch(''); setSemanticResults(null); }} className="text-text-muted hover:text-text-secondary">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
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
            {filteredReceipts.map((receipt, index) => {
              const tone = confidenceTone(toNumber(receipt.confidence_score));
              const vendor = receipt.vendor_name ?? 'Unknown Vendor';
              const total = toNumber(receipt.total_amount);
              const category = receipt.category ?? 'Uncategorized';
              const cardLastFour = receipt.card_last_four ?? '';
              const hasHash = Boolean(receipt.integrity_hash);
              const missingBN = !String(receipt.vendor_tax_number ?? '').trim();
              const approval = approvalBadge(receipt.approval_status);
              const isOptimistic = Boolean((receipt as ReceiptRow & { _optimistic?: boolean })._optimistic);
              const needsReimburse = receipt.paid_by === 'employee_cash';
              const reimburse = needsReimburse ? reimbursementBadge(receipt.reimbursement_status) : null;

              return (
                <motion.button
                  key={receipt.id}
                  custom={index}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  layoutId={`receipt-card-${receipt.id}`}
                  type="button"
                  onClick={() => setSelectedReceipt(receipt)}
                  className={`w-full rounded-2xl border border-glass-border bg-surface p-4 text-left shadow-sm transition hover:border-glass-border-hover hover:bg-surface-raised ${isOptimistic ? 'optimistic-pulse' : ''}`}
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

                        {/* Approval Status Badge */}
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${approval.cls}`}>
                          {approval.label}
                        </span>

                        {/* Reimbursement Badge */}
                        {reimburse && (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${reimburse.cls}`}>
                            <DollarSign className="h-3 w-3" />
                            {reimburse.label}
                          </span>
                        )}

                        {isOptimistic && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-400">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Uploading
                          </span>
                        )}
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
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedReceipt && (
          <ReceiptDetailModal
            receipt={selectedReceipt}
            onClose={() => setSelectedReceipt(null)}
            role={role}
            onUpdate={onUpdate}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Detail Modal ─── */

type ReceiptDetailModalProps = {
  receipt: ReceiptRow;
  onClose: () => void;
  role?: UserRole;
  onUpdate?: () => Promise<void> | void;
};

function ReceiptDetailModal({ receipt, onClose, role = 'Owner', onUpdate }: ReceiptDetailModalProps) {
  const score = toNumber(receipt.confidence_score);
  const tone = confidenceTone(score);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(receipt.notes ?? '');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [localApproval, setLocalApproval] = useState(receipt.approval_status ?? 'submitted');

  const approval = approvalBadge(localApproval);
  const needsReimburse = receipt.paid_by === 'employee_cash';
  const reimburse = needsReimburse ? reimbursementBadge(receipt.reimbursement_status) : null;

  async function handleApproval(status: 'approved' | 'rejected') {
    setApprovalLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await updateReceiptApproval(
        receipt.id,
        status,
        user.id,
        needsReimburse,
        receipt.vendor_name || 'Unknown',
        receipt.transaction_date || '',
        role
      );

      setLocalApproval(status);
      if (onUpdate) await onUpdate();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setApprovalLoading(false);
    }
  }

  async function handleSaveEdit() {
    setEditSaving(true);
    setEditError('');
    setEditSuccess(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await updateReceiptNotes(receipt.id, notesValue, user.id, receipt);

      setEditSuccess(true);
      setEditingNotes(false);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Edit failed.');
    } finally {
      setEditSaving(false);
    }
  }

  const imageUrl = receipt.image_url ?? '';
  const integrityHash = receipt.integrity_hash ?? '';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-xl sm:items-center"
      onClick={onClose}
    >
      <motion.div
        layoutId={`receipt-card-${receipt.id}`}
        initial={{ y: 0, opacity: 1, scale: 1 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-glass-border bg-surface shadow-2xl sm:max-w-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-glass-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-text-primary">
              {receipt.vendor_name ?? 'Unknown Vendor'}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-xs text-text-muted">{formatDate(receipt.transaction_date)}</p>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${approval.cls}`}>
                {approval.label}
              </span>
              {reimburse && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${reimburse.cls}`}>
                  <DollarSign className="h-3 w-3" />
                  {reimburse.label}
                </span>
              )}
            </div>
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
              <img src={imageUrl} alt="Receipt" className="max-h-80 w-full object-contain" />
            </div>
          ) : (
            <div className="border-b border-glass-border bg-surface-raised px-5 py-8 text-center">
              <Eye className="mx-auto mb-2 h-8 w-8 text-text-muted/30" />
              <p className="text-sm text-text-muted">No image preview available.</p>
            </div>
          )}

          <div className="space-y-6 p-5">
            {/* AI Warning Panel */}
            <div className={`rounded-2xl border px-4 py-3 ${tone.panel}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wide">AI Confidence</p>
                <p className="text-sm font-bold tabular-nums">{score}</p>
              </div>
            </div>

            {!receipt.vendor_tax_number && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                  <p className="text-xs leading-relaxed text-amber-300">
                    GST/BN is missing on this receipt.
                  </p>
                </div>
              </div>
            )}

            {/* Owner Approval Actions */}
            {role === 'Owner' && localApproval !== 'approved' && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleApproval('approved')}
                  disabled={approvalLoading}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-success px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-success/80 disabled:opacity-60"
                >
                  {approvalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleApproval('rejected')}
                  disabled={approvalLoading}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-60"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
              </div>
            )}

            {localApproval === 'approved' && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-semibold">Approved</span>
                </div>
              </div>
            )}

            {/* Luxury Card 1: Store Info */}
            <div className="rounded-3xl border border-glass-border bg-surface shadow-sm">
              <div className="border-b border-glass-border px-5 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">1. Store Info</p>
              </div>
              <div className="grid gap-x-4 gap-y-3 p-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Vendor Name</p>
                  <p className="mt-0.5 text-sm font-medium text-text-primary">{receipt.vendor_name || '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Address</p>
                  <p className="mt-0.5 text-sm font-medium text-text-primary">{receipt.vendor_address || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Date & Time</p>
                  <p className="mt-0.5 text-sm font-medium text-text-primary">
                    {formatDate(receipt.transaction_date)} {receipt.transaction_time ? `at ${receipt.transaction_time}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Payment</p>
                  <p className="mt-0.5 text-sm font-medium text-text-primary">
                    {receipt.payment_method || 'Unknown'}{receipt.card_last_four ? ` •••• ${receipt.card_last_four}` : ''}
                  </p>
                </div>
                {receipt.paid_by && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Paid By</p>
                    <p className="mt-0.5 text-sm font-medium text-text-primary">
                      {receipt.paid_by === 'employee_cash' ? 'Employee Cash' : 'Company Card'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Luxury Card 2: Financials */}
            <div className="rounded-3xl border border-glass-border bg-surface shadow-sm">
              <div className="border-b border-glass-border px-5 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">2. Financials</p>
              </div>
              <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Subtotal</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-text-primary">{formatCurrency(toNumber(receipt.subtotal), receipt.currency ?? 'CAD')}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">GST</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-text-primary">{formatCurrency(toNumber(receipt.tax_amount), receipt.currency ?? 'CAD')}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">PST</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-text-primary">{formatCurrency(toNumber(receipt.pst_amount), receipt.currency ?? 'CAD')}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-champagne">Total</p>
                  <p className="mt-0.5 text-base font-bold tabular-nums text-champagne">{formatCurrency(toNumber(receipt.total_amount), receipt.currency ?? 'CAD')}</p>
                </div>
              </div>
            </div>

            {/* Luxury Card 3: Compliance & Edits */}
            <div className="rounded-3xl border border-glass-border bg-surface shadow-sm">
              <div className="flex items-center justify-between border-b border-glass-border px-5 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">3. Compliance</p>
                {!editingNotes && role !== 'Accountant' && (
                  <button
                    type="button"
                    onClick={() => { setEditingNotes(true); setEditSuccess(false); setEditError(''); }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-glass-border bg-surface-raised px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition hover:border-glass-border-hover hover:text-champagne"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit Mode
                  </button>
                )}
              </div>
              <div className="grid gap-x-4 gap-y-4 p-5 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">GST / Business Number</p>
                  <p className="mt-0.5 text-sm font-mono font-medium text-text-primary">{receipt.vendor_tax_number || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Category</p>
                  <p className="mt-0.5 text-sm font-medium text-text-primary">{receipt.category || '—'}</p>
                </div>
                
                <div className="sm:col-span-2 mt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-2">Business purpose</p>
                  {editingNotes ? (
                    <div className="space-y-3">
                      <textarea
                        rows={3}
                        value={notesValue}
                        onChange={(e) => setNotesValue(e.target.value)}
                        className="w-full resize-none rounded-xl border border-glass-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-champagne/40 focus:ring-2 focus:ring-champagne/15"
                        placeholder="Describe the business purpose..."
                      />
                      {editError && <p className="text-xs text-red-400">{editError}</p>}
                      {editSuccess && <p className="text-xs font-medium text-emerald-light">Edit saved across history log.</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          disabled={editSaving}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-success px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-success/80 disabled:opacity-60"
                        >
                          {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          {editSaving ? 'Archiving...' : 'Save Record'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingNotes(false); setNotesValue(receipt.notes ?? ''); }}
                          className="rounded-xl border border-glass-border bg-surface px-3 py-2.5 text-sm font-semibold text-text-secondary transition hover:bg-surface-raised"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-glass-border bg-surface-raised p-3">
                      <p className="text-sm text-text-secondary">
                        {notesValue || <span className="italic text-text-muted">No business purpose recorded.</span>}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Line Items (Stacked Row Display) */}
            {receipt.line_items && Array.isArray(receipt.line_items) && receipt.line_items.length > 0 && (
              <div className="rounded-3xl border border-glass-border bg-surface shadow-sm overflow-hidden">
                <div className="border-b border-glass-border px-5 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">Line Items</p>
                </div>
                <div className="divide-y divide-glass-border">
                  {receipt.line_items.map((item, idx) => (
                    <div key={idx} className="px-5 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-text-primary">{item.description || 'Item'}</p>
                        <p className="text-sm font-bold tabular-nums text-champagne">${toNumber(item.line_total).toFixed(2)}</p>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-muted">
                        <span>Qty: {item.quantity}</span>
                        <span>Unit: ${toNumber(item.unit_price).toFixed(2)}</span>
                        {toNumber(item.tax_amount) > 0 && <span>Tax: ${toNumber(item.tax_amount).toFixed(2)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {integrityHash && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-center">
                <Fingerprint className="mx-auto mb-2 h-5 w-5 text-emerald-light" />
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-light">Immutable SHA-256 Record</p>
                <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-emerald-300/80">{integrityHash}</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}