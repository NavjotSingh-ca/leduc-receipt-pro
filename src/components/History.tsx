'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
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
  Tag,
  Trash2,
  X,
  XCircle,
  BrainCircuit,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { semanticSearchAction } from '@/app/actions/semantic-search';
import { updateReceiptApproval, updateReceiptNotes, deleteReceipt, getReceiptsPaginated } from '@/lib/services/receipts';
import { CATEGORIES } from '@/components/scanner/types';

import type { ReceiptRow } from '@/lib/types';
import type { UserRole } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  toNumber,
  formatCurrency,
  formatDate,
  categoryColor,
  confidenceTone,
  approvalBadge,
  reimbursementBadge,
} from '@/lib/ui-utils';

/* ─── Skeleton Loader for Receipt Cards ─── */
function ReceiptSkeleton() {
  return (
    <div className="rounded-2xl border border-glass-border bg-surface p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl shimmer-loading flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 rounded shimmer-loading" />
          <div className="h-3 w-48 rounded shimmer-loading" />
          <div className="h-3 w-24 rounded shimmer-loading" />
        </div>
        <div className="h-6 w-16 rounded-full shimmer-loading" />
      </div>
    </div>
  );
}

export function ReceiptSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <ReceiptSkeleton key={i} />
      ))}
    </div>
  );
}

/* ─── Contextual Empty States ─── */
const emptyStateMap: Record<string, { title: string; subtitle: string }> = {
  'flagged-audit': { title: 'No flagged receipts', subtitle: 'All receipts pass your audit rules.' },
  'reimbursement': { title: 'No pending reimbursements', subtitle: 'All employee expenses are settled.' },
  'approved': { title: 'No approved receipts', subtitle: 'Receipts will appear here once approved by the owner.' },
  'review': { title: 'No receipts pending review', subtitle: 'All submissions have been processed.' },
  'missing': { title: 'No incomplete receipts', subtitle: 'All receipts have complete information.' },
  'all': { title: 'No receipts yet', subtitle: 'Scan your first receipt to start building your CRA-compliant ledger.' },
};

type HistoryProps = {
  receipts: ReceiptRow[];
  activeFilter?: string;
  onUpdate?: () => Promise<void> | void;
  role?: UserRole;
  userId?: string | null;
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
  receipts: initialReceipts,
  activeFilter = 'all',
  onUpdate,
  role = 'Owner',
  userId,
}: HistoryProps) {
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRow | null>(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [semanticMode, setSemanticMode] = useState(false);
  const [semanticResults, setSemanticResults] = useState<string[] | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);

  // userId is now passed as a prop from page.tsx

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch
  } = useInfiniteQuery({
    initialPageParam: 0,
    queryKey: ['receipts_paginated', role, userId, activeFilter, search, semanticResults],
    queryFn: async ({ pageParam = 0 }) => {
      if (!userId) return { receipts: [], totalCount: 0 };
      
      let approvalStatus: string | undefined = undefined;
      let filterCategory: string | undefined = undefined;
      
      const normalizedFilter = activeFilter.toLowerCase();
      if (normalizedFilter === 'approved') approvalStatus = 'approved';
      else if (normalizedFilter === 'review' || normalizedFilter === 'pending-review') approvalStatus = 'submitted';
      else if (normalizedFilter !== 'all' && normalizedFilter !== 'missing' && normalizedFilter !== 'missing-bn' && normalizedFilter !== 'flagged-audit' && normalizedFilter !== 'reimbursement') {
        filterCategory = activeFilter;
      }

      // If semantic mode is active but we have no results yet, return empty
      if (semanticMode && !semanticResults) return { receipts: [], totalCount: 0 };

      return getReceiptsPaginated({
        role,
        userId,
        limit: 25,
        offset: pageParam,
        category: filterCategory,
        approvalStatus: approvalStatus,
        search: search.trim() ? search.trim() : undefined,
      });
    },
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.receipts.length < 25) return undefined;
      return pages.length * 25;
    },
    enabled: !!userId,
  });

  const receipts = React.useMemo(() => {
    if (!infiniteData) return [];
    return infiniteData.pages.flatMap((page) => page.receipts);
  }, [infiniteData]);

  const totalCount = infiniteData?.pages[0]?.totalCount || 0;

  const filteredReceipts = useMemo(() => {
    let items = [...receipts];
    const normalizedFilter = activeFilter.toLowerCase();

    // The RPC handles basic category and approval filtering, 
    // but complex client filters (like 'missing-bn', 'flagged-audit') still need client-side filtering
    // since we didn't push all those specific flags into the RPC yet.
    if (normalizedFilter !== 'all') {
      if (normalizedFilter === 'missing' || normalizedFilter === 'missing-bn') {
        items = items.filter(
          (r) =>
            !String(r.vendor_tax_number ?? '').trim() ||
            !String(r.vendor_name ?? '').trim() ||
            !String(r.transaction_date ?? '').trim() ||
            toNumber(r.total_amount) <= 0
        );
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
      }
    }

    if (semanticMode && semanticResults) {
      items = items.filter((r) => semanticResults.includes(r.id));
    }

    return items;
  }, [receipts, activeFilter, semanticMode, semanticResults]);

  const handleSemanticSearch = async () => {
    if (!search.trim()) return;
    setSemanticLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      const userId = session?.user?.id;
      const results = await semanticSearchAction(search.trim());
      setSemanticResults(results.map((r) => r.id));
    } catch (err) {
      console.error(err);
      setSemanticResults([]);
    } finally {
      setSemanticLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await refetch();
      if (onUpdate) await onUpdate();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <div className="space-y-4 fade-in">
        {/* Global Search Bar - Moved to Top */}
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



        {filteredReceipts.length === 0 ? (
          <div className="rounded-3xl border border-glass-border bg-surface p-12 text-center shadow-sm">
            <Receipt className="mx-auto mb-3 h-12 w-12 text-text-muted/30" />
            <p className="text-sm font-semibold text-text-primary">
              {receipts.length === 0
                ? (emptyStateMap['all'].title)
                : (emptyStateMap[activeFilter.toLowerCase()] ?? emptyStateMap['all']).title}
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {receipts.length === 0
                ? emptyStateMap['all'].subtitle
                : (emptyStateMap[activeFilter.toLowerCase()] ?? emptyStateMap['all']).subtitle}
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
                  className={`w-full rounded-2xl border border-glass-border bg-surface p-4 text-left shadow-sm transition hover:border-champagne/40 hover:bg-surface-raised ${isOptimistic ? 'optimistic-pulse' : 'glowing-border'}`}
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

                        {/* Estimate Warning Badge */}
                        {receipt.document_type === 'estimate' && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-400">
                            Non-Deductible Estimate
                          </span>
                        )}

                        {/* Fraud Badge */}
                        {receipt.fraud_suspicion && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-400">
                            Fraud Flag
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
            
            {hasNextPage && (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-glass-border bg-surface py-3 text-sm font-semibold text-champagne transition hover:bg-surface-raised disabled:opacity-50"
              >
                {isFetchingNextPage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                {isFetchingNextPage ? 'Loading more...' : 'Load More Receipts'}
              </button>
            )}
            
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {selectedReceipt && (
          <ReceiptDetailModal
            key={`detail-${selectedReceipt.id}`}
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
  const [editing, setEditing] = useState(false);
  
  // Full Edit State
  const [vendorName, setVendorName] = useState(receipt.vendor_name ?? '');
  const [vendorTaxNumber, setVendorTaxNumber] = useState(receipt.vendor_tax_number ?? receipt.business_number ?? '');
  const [totalAmount, setTotalAmount] = useState(receipt.total_amount ?? 0);
  const [transactionDate, setTransactionDate] = useState(receipt.transaction_date ?? '');
  const [category, setCategory] = useState(receipt.category ?? '');
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

      const { updateReceipt } = await import('@/lib/services/receipts');
      
      await updateReceipt(receipt.id, {
        vendor_name: vendorName,
        vendor_tax_number: vendorTaxNumber,
        business_number: vendorTaxNumber, // Maintain backward compatibility
        total_amount: Number(totalAmount),
        transaction_date: transactionDate,
        category: category,
        notes: notesValue,
      }, user.id, receipt);

      setEditSuccess(true);
      setEditing(false);
      if (onUpdate) await onUpdate();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Edit failed.');
    } finally {
      setEditSaving(false);
    }
  }

  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Are you sure you want to delete this receipt? This action will move it to the trash.")) return;
    setDeleteLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await deleteReceipt(receipt.id, user.id);
      
      onClose();
      if (onUpdate) await onUpdate();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setDeleteLoading(false);
    }
  }

  const [syncLoading, setSyncLoading] = useState<string | null>(null);

  async function handleAccountingSync(provider: 'qbo' | 'xero') {
    setSyncLoading(provider);
    try {
      const resp = await fetch(`/api/integrations/${provider}?action=sync&receiptId=${receipt.id}`, { method: 'POST' });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Sync failed');
      alert(`Successfully synced to ${provider.toUpperCase()}`);
    } catch (err: any) {
      alert(`Sync Error: ${err.message}`);
    } finally {
      setSyncLoading(null);
    }
  }

  const imageUrl = receipt.image_url ?? '';
  const integrityHash = receipt.integrity_hash ?? '';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/80 backdrop-blur-2xl sm:items-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[2.5rem] border border-glass-border bg-surface shadow-2xl sm:max-w-3xl sm:rounded-[2.5rem] sm:mb-8"
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteLoading}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10 text-red-400 transition hover:bg-red-500/20 shadow-lg hover:scale-110 active:scale-90 disabled:opacity-50 disabled:scale-100"
              title="Delete Receipt"
              aria-label="Delete receipt"
            >
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised text-text-muted transition hover:bg-surface-hover hover:text-text-primary shadow-lg hover:scale-110 active:scale-90"
              aria-label="Close receipt detail"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {imageUrl ? (
            <div className="relative group border-b border-glass-border bg-obsidian/20 overflow-hidden">
              <img 
                src={imageUrl} 
                alt="Receipt" 
                className="max-h-[50vh] w-full object-contain transition-transform duration-500 group-hover:scale-[1.02]" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-obsidian/40 to-transparent pointer-events-none" />
            </div>
          ) : (
            <div className="border-b border-glass-border bg-surface-raised/50 px-5 py-12 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-surface p-4 shadow-inner">
                <Eye className="h-8 w-8 text-text-muted/20" />
              </div>
              <p className="text-sm font-medium text-text-muted">High-Security Image Storage</p>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-text-muted/60">No visual preview available for this node</p>
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
              <div className="space-y-3">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="font-semibold">Approved</span>
                  </div>
                </div>
                
                {role !== 'Employee' && (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleAccountingSync('qbo')}
                      disabled={!!syncLoading}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-glass-border bg-white px-3 py-2.5 text-xs font-bold text-black transition hover:bg-white/90 disabled:opacity-50"
                    >
                      {syncLoading === 'qbo' ? <Loader2 className="h-3 w-3 animate-spin" /> : <img src="https://upload.wikimedia.org/wikipedia/commons/2/23/QuickBooks_Logo.svg" alt="" className="h-3" />}
                      Sync to QBO
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAccountingSync('xero')}
                      disabled={!!syncLoading}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-glass-border bg-[#00b7e2] px-3 py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {syncLoading === 'xero' ? <Loader2 className="h-3 w-3 animate-spin" /> : <img src="https://upload.wikimedia.org/wikipedia/commons/9/9f/Xero_software_logo.svg" alt="" className="h-3" />}
                      Sync to Xero
                    </button>
                  </div>
                )}
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
                  {editing ? (
                    <input 
                      type="text" 
                      value={vendorName} 
                      onChange={(e) => setVendorName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-glass-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus:border-champagne/40"
                    />
                  ) : (
                    <p className="mt-0.5 text-sm font-medium text-text-primary">{vendorName || '—'}</p>
                  )}
                </div>
                <div className="sm:col-span-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">GST/BN</p>
                  {editing ? (
                    <input 
                      type="text" 
                      value={vendorTaxNumber} 
                      onChange={(e) => setVendorTaxNumber(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-glass-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus:border-champagne/40"
                    />
                  ) : (
                    <p className="mt-0.5 text-sm font-medium text-text-primary">{vendorTaxNumber || '—'}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Address</p>
                  <p className="mt-0.5 text-sm font-medium text-text-primary">{receipt.vendor_address || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Date</p>
                  {editing ? (
                    <input 
                      type="date" 
                      value={transactionDate} 
                      onChange={(e) => setTransactionDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-glass-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus:border-champagne/40"
                    />
                  ) : (
                    <p className="mt-0.5 text-sm font-medium text-text-primary">
                      {formatDate(transactionDate)}
                    </p>
                  )}
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
                  {editing ? (
                    <input 
                      type="number" 
                      step="0.01"
                      value={totalAmount} 
                      onChange={(e) => setTotalAmount(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-glass-border bg-surface-raised px-3 py-1.5 text-sm font-bold text-champagne outline-none focus:border-champagne/40"
                    />
                  ) : (
                    <p className="mt-0.5 text-base font-bold tabular-nums text-champagne">{formatCurrency(toNumber(totalAmount), receipt.currency ?? 'CAD')}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Luxury Card 3: Compliance & Edits */}
            <div className="rounded-3xl border border-glass-border bg-surface shadow-sm">
              <div className="flex items-center justify-between border-b border-glass-border px-5 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">3. Compliance</p>
                {!editing && role !== 'Accountant' && (
                  <button
                    type="button"
                    onClick={() => { setEditing(true); setEditSuccess(false); setEditError(''); }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-glass-border bg-surface-raised px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition hover:border-glass-border-hover hover:text-champagne"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit Mode
                  </button>
                )}
              </div>
              <div className="grid gap-x-4 gap-y-4 p-5 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Category</p>
                  {editing ? (
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-glass-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus:border-champagne/40"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="mt-0.5 text-sm font-medium text-text-primary">{category || '—'}</p>
                  )}
                </div>

                <div className="sm:col-span-2 mt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-2">Business purpose</p>
                  {editing ? (
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-glass-border bg-surface-raised px-3 py-1.5 text-sm text-text-primary outline-none focus:border-champagne/40"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="mt-0.5 text-sm font-medium text-text-primary">{category || '—'}</p>
                  )}
                </div>
                
                <div className="sm:col-span-2 mt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted mb-2">Business purpose</p>
                  {editing ? (
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
                          onClick={() => { setEditing(false); setNotesValue(receipt.notes ?? ''); }}
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