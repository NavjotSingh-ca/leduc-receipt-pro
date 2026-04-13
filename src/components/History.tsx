'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  ChevronRight,
  CreditCard,
  Eye,
  Fingerprint,
  Loader2,
  MapPin,
  Receipt,
  RefreshCw,
  Search,
  Tag,
  X,
} from 'lucide-react';

type ReceiptRow = {
  id: string;
  userid?: string;

  vendor_name?: string;
  vendorname?: string;

  vendor_address?: string;
  vendoraddress?: string;

  business_number?: string;
  vendortaxnumber?: string;

  transaction_date?: string;
  transactiondate?: string;

  transaction_time?: string;
  transactiontime?: string;

  category?: string;
  notes?: string;

  payment_method?: string;
  paymentmethod?: string;

  card_last_four?: string;
  cardlastfour?: string;

  currency?: string;

  subtotal?: number;
  tax_amount?: number;
  taxamount?: number;
  pst_amount?: number;
  pstamount?: number;
  total_amount?: number;
  totalamount?: number;

  job_code?: string;
  job_codes?: string;
  vehicle_id?: string;
  business_use_percent?: number;

  line_items?: Array<Record<string, unknown>> | string;

  integrity_hash?: string;
  integrityhash?: string;

  image_url?: string;
  imageurl?: string;

  confidence_score?: number;
  confidencescore?: number;

  created_at?: string;
  createdat?: string;
};

type HistoryProps = {
  receipts: ReceiptRow[];
  activeFilter?: string;
  onUpdate?: () => Promise<void> | void;
};

function getVendorName(receipt: ReceiptRow): string {
  return receipt.vendor_name ?? receipt.vendorname ?? 'Unknown Vendor';
}

function getVendorAddress(receipt: ReceiptRow): string {
  return receipt.vendor_address ?? receipt.vendoraddress ?? '';
}

function getBusinessNumber(receipt: ReceiptRow): string {
  return receipt.business_number ?? receipt.vendortaxnumber ?? '';
}

function getTransactionDate(receipt: ReceiptRow): string {
  return receipt.transaction_date ?? receipt.transactiondate ?? '';
}

function getTransactionTime(receipt: ReceiptRow): string {
  return receipt.transaction_time ?? receipt.transactiontime ?? '';
}

function getPaymentMethod(receipt: ReceiptRow): string {
  return receipt.payment_method ?? receipt.paymentmethod ?? '';
}

function getCardLastFour(receipt: ReceiptRow): string {
  return receipt.card_last_four ?? receipt.cardlastfour ?? '';
}

function getSubtotal(receipt: ReceiptRow): number {
  return receipt.subtotal ?? 0;
}

function getTaxAmount(receipt: ReceiptRow): number {
  return receipt.tax_amount ?? receipt.taxamount ?? 0;
}

function getPstAmount(receipt: ReceiptRow): number {
  return receipt.pst_amount ?? receipt.pstamount ?? 0;
}

function getTotalAmount(receipt: ReceiptRow): number {
  return receipt.total_amount ?? receipt.totalamount ?? 0;
}

function getIntegrityHash(receipt: ReceiptRow): string {
  return receipt.integrity_hash ?? receipt.integrityhash ?? '';
}

function getImageUrl(receipt: ReceiptRow): string {
  return receipt.image_url ?? receipt.imageurl ?? '';
}

function getConfidenceScore(receipt: ReceiptRow): number {
  return receipt.confidence_score ?? receipt.confidencescore ?? 0;
}

function formatCurrency(value: number, currency = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currency || 'CAD',
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDate(value?: string): string {
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
    'Office Supplies': '#3b82f6',
    'Meals Entertainment': '#f59e0b',
    Travel: '#8b5cf6',
    Fuel: '#ef4444',
    'Professional Fees': '#10b981',
    Supplies: '#06b6d4',
    'Software Subscriptions': '#ec4899',
    Utilities: '#f97316',
    'General Expense': '#6b7280',
  };

  return map[category ?? ''] ?? '#6b7280';
}

function confidenceTone(score: number) {
  if (score >= 85) {
    return {
      pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      panel: 'bg-emerald-50 border-emerald-100 text-emerald-800',
      label: 'High',
    };
  }

  if (score >= 60) {
    return {
      pill: 'bg-amber-50 text-amber-700 border-amber-200',
      panel: 'bg-amber-50 border-amber-100 text-amber-800',
      label: 'Medium',
    };
  }

  return {
    pill: 'bg-red-50 text-red-700 border-red-200',
    panel: 'bg-red-50 border-red-100 text-red-800',
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
      if (normalizedFilter === 'missing') {
        items = items.filter(
          (receipt) =>
            !getBusinessNumber(receipt).trim() ||
            !getVendorName(receipt).trim() ||
            !getTransactionDate(receipt).trim() ||
            getTotalAmount(receipt) <= 0
        );
      } else if (normalizedFilter === 'approved') {
        items = items.filter((receipt) => getConfidenceScore(receipt) >= 85);
      } else if (normalizedFilter === 'review') {
        items = items.filter((receipt) => getConfidenceScore(receipt) < 85);
      } else {
        items = items.filter(
          (receipt) => (receipt.category ?? 'Uncategorized').toLowerCase() === normalizedFilter
        );
      }
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((receipt) => {
        const fields = [
          getVendorName(receipt),
          getVendorAddress(receipt),
          getBusinessNumber(receipt),
          getTransactionDate(receipt),
          receipt.category ?? '',
          receipt.notes ?? '',
          getPaymentMethod(receipt),
          getCardLastFour(receipt),
          receipt.job_code ?? '',
          receipt.job_codes ?? '',
          receipt.vehicle_id ?? '',
          receipt.id,
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
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Receipts</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {filteredReceipts.length} record{filteredReceipts.length === 1 ? '' : 's'} shown
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendor, date, BN, amount, category..."
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        {filteredReceipts.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <Receipt className="mx-auto mb-3 h-12 w-12 text-slate-200" />
            <p className="text-sm font-medium text-slate-500">
              {receipts.length === 0
                ? 'No receipts yet. Scan your first receipt to get started.'
                : 'No receipts match your current filter or search.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReceipts.map((receipt) => {
              const tone = confidenceTone(getConfidenceScore(receipt));
              const vendor = getVendorName(receipt);
              const total = getTotalAmount(receipt);
              const category = receipt.category ?? 'Uncategorized';
              const cardLastFour = getCardLastFour(receipt);
              const hasHash = Boolean(getIntegrityHash(receipt));
              const missingBN = !getBusinessNumber(receipt).trim();

              return (
                <button
                  key={receipt.id}
                  type="button"
                  onClick={() => setSelectedReceipt(receipt)}
                  className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
                      style={{ backgroundColor: categoryColor(category) }}
                    >
                      {vendor.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{vendor}</p>

                        {hasHash && (
                          <span title="SHA-256 integrity hash stored">
                            <Fingerprint className="h-3.5 w-3.5 text-emerald-500" />
                          </span>
                        )}

                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.pill}`}
                        >
                          {tone.label} AI
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span>{formatDate(getTransactionDate(receipt))}</span>
                        <span className="h-1 w-1 rounded-full bg-slate-200" />
                        <span>{category}</span>
                        {cardLastFour && (
                          <>
                            <span className="h-1 w-1 rounded-full bg-slate-200" />
                            <span>•••• {cardLastFour}</span>
                          </>
                        )}
                        {missingBN && (
                          <>
                            <span className="h-1 w-1 rounded-full bg-slate-200" />
                            <span className="font-medium text-amber-600">Missing GST/BN</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span className="text-sm font-bold text-blue-600">
                        {formatCurrency(total, receipt.currency ?? 'CAD')}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
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

type ReceiptDetailModalProps = {
  receipt: ReceiptRow;
  onClose: () => void;
};

function ReceiptDetailModal({ receipt, onClose }: ReceiptDetailModalProps) {
  const score = getConfidenceScore(receipt);
  const tone = confidenceTone(score);

  const rows = [
    {
      label: 'Date',
      value: formatDate(getTransactionDate(receipt)),
      icon: <CalendarDays className="h-4 w-4" />,
    },
    getTransactionTime(receipt)
      ? {
          label: 'Time',
          value: getTransactionTime(receipt),
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
      value: formatCurrency(getSubtotal(receipt), receipt.currency ?? 'CAD'),
      icon: <Receipt className="h-4 w-4" />,
    },
    {
      label: 'GST',
      value: formatCurrency(getTaxAmount(receipt), receipt.currency ?? 'CAD'),
      icon: <Receipt className="h-4 w-4" />,
    },
    {
      label: 'PST/HST',
      value: formatCurrency(getPstAmount(receipt), receipt.currency ?? 'CAD'),
      icon: <Receipt className="h-4 w-4" />,
    },
    {
      label: 'Total',
      value: formatCurrency(getTotalAmount(receipt), receipt.currency ?? 'CAD'),
      icon: <Receipt className="h-4 w-4" />,
    },
    {
      label: 'Payment',
      value: [
        getPaymentMethod(receipt),
        getCardLastFour(receipt) ? `•••• ${getCardLastFour(receipt)}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      icon: <CreditCard className="h-4 w-4" />,
    },
    getVendorAddress(receipt)
      ? {
          label: 'Address',
          value: getVendorAddress(receipt),
          icon: <MapPin className="h-4 w-4" />,
        }
      : null,
    getBusinessNumber(receipt)
      ? {
          label: 'Business Number',
          value: getBusinessNumber(receipt),
          icon: <Fingerprint className="h-4 w-4" />,
        }
      : null,
    receipt.job_code || receipt.job_codes
      ? {
          label: 'Job Code',
          value: receipt.job_code ?? receipt.job_codes ?? '',
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

  const imageUrl = getImageUrl(receipt);
  const integrityHash = getIntegrityHash(receipt);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-slate-900">
              {getVendorName(receipt)}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              {formatDate(getTransactionDate(receipt))}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {imageUrl ? (
            <div className="border-b border-slate-100 bg-slate-50">
              <img
                src={imageUrl}
                alt="Receipt"
                className="max-h-80 w-full object-contain"
              />
            </div>
          ) : (
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-8 text-center">
              <Eye className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-400">No image preview available.</p>
            </div>
          )}

          <div className="space-y-5 p-5">
            <div className={`rounded-2xl border px-4 py-3 ${tone.panel}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wide">AI Confidence</p>
                <p className="text-sm font-bold">{score}</p>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed">
                {score >= 85
                  ? 'Strong extraction quality. Still verify totals, tax fields, and business number before filing.'
                  : score >= 60
                  ? 'Some fields may need review. Check vendor, tax split, and missing identifiers.'
                  : 'Low confidence result. Review all fields carefully before relying on this receipt.'}
              </p>
            </div>

            {!getBusinessNumber(receipt) && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                  <p className="text-xs leading-relaxed">
                    GST/BN is missing on this receipt. Review before claiming input tax credits.
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Receipt details
                </p>
              </div>

              <div className="px-4 py-2">
                {rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-start justify-between gap-4 border-b border-slate-50 py-3 last:border-0"
                  >
                    <div className="flex items-center gap-2 text-slate-400">
                      {row.icon}
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        {row.label}
                      </span>
                    </div>
                    <span className="max-w-[58%] break-words text-right text-sm font-semibold text-slate-900">
                      {row.value || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {receipt.notes && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-blue-500">
                  Business purpose
                </p>
                <p className="text-sm text-blue-900">{receipt.notes}</p>
              </div>
            )}

            {integrityHash && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-emerald-500" />
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">
                    SHA-256 integrity hash
                  </p>
                </div>
                <p className="break-all font-mono text-[11px] leading-relaxed text-emerald-700">
                  {integrityHash}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}