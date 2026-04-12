'use client';

import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeAlert,
  BarChart3,
  CheckCircle2,
  FileSearch,
  Receipt,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface ReceiptRow {
  id: string;
  user_id?: string;

  vendor_name?: string;
  vendorname?: string;

  vendor_address?: string | null;
  vendoraddress?: string | null;

  business_number?: string | null;
  vendortaxnumber?: string | null;

  total_amount?: number | null;
  totalamount?: number | null;

  subtotal?: number | null;

  tax_amount?: number | null;
  taxamount?: number | null;

  pst_amount?: number | null;
  pstamount?: number | null;

  transaction_date?: string | null;
  transactiondate?: string | null;

  transaction_time?: string | null;
  transactiontime?: string | null;

  category?: string | null;
  notes?: string | null;

  payment_method?: string | null;
  paymentmethod?: string | null;

  card_last_four?: string | null;
  cardlastfour?: string | null;

  currency?: string | null;

  confidence_score?: number | null;
  confidencescore?: number | null;

  cra_readiness_score?: number | null;
  thermal_warning?: boolean | null;
  integrity_hash?: string | null;
  image_url?: string | null;
  created_at?: string | null;

  accountant_status?: string | null;
  review_status?: string | null;
  status?: string | null;

  flagged_for_audit?: boolean | null;
  needs_review?: boolean | null;
  duplicate_warning?: boolean | null;
  math_mismatch_warning?: boolean | null;
  missing_bn_warning?: boolean | null;
}

interface DashboardProps {
  receipts: ReceiptRow[];
  onFilterClick: (filterType: string) => void;
}

const CATEGORY_COLORS = [
  '#3b82f6',
  '#60a5fa',
  '#2563eb',
  '#93c5fd',
  '#1d4ed8',
  '#38bdf8',
  '#0ea5e9',
  '#6366f1',
];

const currencyFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 2,
});

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function getTotalAmount(receipt: ReceiptRow): number {
  return toNumber(receipt.total_amount ?? receipt.totalamount);
}

function getTaxAmount(receipt: ReceiptRow): number {
  return toNumber(receipt.tax_amount ?? receipt.taxamount);
}

function getDateValue(receipt: ReceiptRow): string {
  return String(receipt.transaction_date ?? receipt.transactiondate ?? '').trim();
}

function getCategory(receipt: ReceiptRow): string {
  return String(receipt.category ?? 'Uncategorized').trim() || 'Uncategorized';
}

function hasBusinessNumber(receipt: ReceiptRow): boolean {
  const bn = String(receipt.business_number ?? receipt.vendortaxnumber ?? '').trim();
  return bn.length > 0;
}

function isPendingReview(receipt: ReceiptRow): boolean {
  const raw = String(receipt.review_status ?? receipt.accountant_status ?? receipt.status ?? '').toLowerCase();

  return (
    Boolean(receipt.needs_review) ||
    raw.includes('pending') ||
    raw.includes('review') ||
    raw.includes('owner review') ||
    raw.includes('accountant review')
  );
}

function isFlaggedForAudit(receipt: ReceiptRow): boolean {
  return (
    Boolean(receipt.flagged_for_audit) ||
    Boolean(receipt.math_mismatch_warning) ||
    Boolean(receipt.duplicate_warning) ||
    Boolean(receipt.thermal_warning) ||
    toNumber(receipt.cra_readiness_score) > 0 && toNumber(receipt.cra_readiness_score) < 70
  );
}

function formatMonthLabel(value: string): string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return value;
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-CA', { month: 'short', year: '2-digit' });
}

function formatShortCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name?: string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-bold text-slate-900">{currencyFormatter.format(toNumber(payload[0].value))}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm transition-all duration-200 hover:border-blue-100 hover:shadow-md sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
          {icon}
        </div>
      </div>

      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function AlertTile({
  title,
  count,
  description,
  tone,
  onClick,
}: {
  title: string;
  count: number;
  description: string;
  tone: 'danger' | 'info' | 'warning';
  onClick: () => void;
}) {
  const toneMap = {
    danger: {
      wrap: 'border-red-100 bg-red-50/70 hover:bg-red-50',
      icon: 'bg-red-100 text-red-600',
      badge: 'bg-red-100 text-red-700',
      arrow: 'text-red-500',
    },
    info: {
      wrap: 'border-blue-100 bg-blue-50/70 hover:bg-blue-50',
      icon: 'bg-blue-100 text-blue-600',
      badge: 'bg-blue-100 text-blue-700',
      arrow: 'text-blue-500',
    },
    warning: {
      wrap: 'border-amber-100 bg-amber-50/70 hover:bg-amber-50',
      icon: 'bg-amber-100 text-amber-600',
      badge: 'bg-amber-100 text-amber-700',
      arrow: 'text-amber-500',
    },
  }[tone];

  const icon =
    tone === 'danger' ? (
      <BadgeAlert className="h-5 w-5" />
    ) : tone === 'info' ? (
      <FileSearch className="h-5 w-5" />
    ) : (
      <ShieldAlert className="h-5 w-5" />
    );

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-3xl border p-4 text-left shadow-sm transition-all duration-200 ${toneMap.wrap}`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${toneMap.icon}`}>
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-900">{title}</p>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${toneMap.badge}`}>{count}</span>
          </div>

          <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p>
        </div>

        <ArrowRight className={`mt-1 h-4 w-4 flex-shrink-0 ${toneMap.arrow}`} />
      </div>
    </button>
  );
}

export default function Dashboard({ receipts, onFilterClick }: DashboardProps) {
  const {
    totalSpent,
    gstRecoverable,
    receiptCount,
    avgTransaction,
    spendingByCategory,
    monthlyTrend,
    missingBNCount,
    pendingReviewCount,
    flaggedAuditCount,
  } = useMemo(() => {
    const totalSpent = receipts.reduce((sum, receipt) => sum + getTotalAmount(receipt), 0);
    const gstRecoverable = receipts.reduce((sum, receipt) => sum + getTaxAmount(receipt), 0);
    const receiptCount = receipts.length;
    const avgTransaction = receiptCount > 0 ? totalSpent / receiptCount : 0;

    const categoryMap = new Map<string, number>();
    const monthMap = new Map<string, number>();

    let missingBNCount = 0;
    let pendingReviewCount = 0;
    let flaggedAuditCount = 0;

    for (const receipt of receipts) {
      const category = getCategory(receipt);
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + getTotalAmount(receipt));

      const fullDate = getDateValue(receipt);
      if (fullDate.length >= 7) {
        const monthKey = fullDate.slice(0, 7);
        monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + getTotalAmount(receipt));
      }

      if (!hasBusinessNumber(receipt) || receipt.missing_bn_warning) {
        missingBNCount += 1;
      }

      if (isPendingReview(receipt)) {
        pendingReviewCount += 1;
      }

      if (isFlaggedForAudit(receipt)) {
        flaggedAuditCount += 1;
      }
    }

    const spendingByCategory = Array.from(categoryMap.entries())
      .map(([name, amount]) => ({
        name,
        amount: Math.round(amount * 100) / 100,
      }))
      .sort((a, b) => b.amount - a.amount);

    const monthlyTrend = Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, amount]) => ({
        month,
        amount: Math.round(amount * 100) / 100,
      }));

    return {
      totalSpent,
      gstRecoverable,
      receiptCount,
      avgTransaction,
      spendingByCategory,
      monthlyTrend,
      missingBNCount,
      pendingReviewCount,
      flaggedAuditCount,
    };
  }, [receipts]);

  return (
    <section className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-500">Business overview</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Dashboard</h2>
        </div>

        <div className="hidden rounded-2xl border border-slate-100 bg-white px-3 py-2 text-xs font-medium text-slate-500 shadow-sm sm:block">
          {receiptCount} receipt{receiptCount === 1 ? '' : 's'} tracked
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Spent"
          value={currencyFormatter.format(totalSpent)}
          helper="All recorded transactions"
          icon={<Wallet className="h-5 w-5" />}
        />
        <StatCard
          label="GST Recoverable"
          value={currencyFormatter.format(gstRecoverable)}
          helper="Federal GST captured"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatCard
          label="Receipt Count"
          value={receiptCount.toLocaleString('en-CA')}
          helper="Stored in the vault"
          icon={<Receipt className="h-5 w-5" />}
        />
        <StatCard
          label="Avg. Transaction"
          value={currencyFormatter.format(avgTransaction)}
          helper="Average receipt amount"
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Spending by Category</p>
              <p className="mt-1 text-xs text-slate-500">Top expense buckets across all receipts</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
              <BarChart3 className="h-5 w-5" />
            </div>
          </div>

          {spendingByCategory.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center">
              <div>
                <p className="text-sm font-semibold text-slate-600">No category data yet</p>
                <p className="mt-1 text-xs text-slate-400">Scan and save receipts to populate this chart.</p>
              </div>
            </div>
          ) : (
            <div className="h-[280px] w-full sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={spendingByCategory} margin={{ top: 8, right: 8, left: -24, bottom: 8 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    interval={0}
                    angle={spendingByCategory.length > 4 ? -20 : 0}
                    textAnchor={spendingByCategory.length > 4 ? 'end' : 'middle'}
                    height={spendingByCategory.length > 4 ? 52 : 30}
                    tickFormatter={(value: string) => (value.length > 14 ? `${value.slice(0, 14)}…` : value)}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(value: number) => formatShortCurrency(value)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="amount" radius={[10, 10, 0, 0]}>
                    {spendingByCategory.map((entry, index) => (
                      <Cell key={`${entry.name}-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Monthly Spending Trend</p>
              <p className="mt-1 text-xs text-slate-500">Spend movement over time</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>

          {monthlyTrend.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center">
              <div>
                <p className="text-sm font-semibold text-slate-600">No monthly trend yet</p>
                <p className="mt-1 text-xs text-slate-400">Receipts with transaction dates will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="h-[280px] w-full sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrend} margin={{ top: 8, right: 8, left: -24, bottom: 8 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={formatMonthLabel}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(value: number) => formatShortCurrency(value)}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => (
                      <CustomTooltip active={active} payload={payload as any} label={formatMonthLabel(String(label ?? ''))} />
                    )}
                  />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#3b82f6', stroke: '#ffffff', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4">
          <p className="text-sm font-bold text-slate-900">Actionable alerts</p>
          <p className="mt-1 text-xs text-slate-500">Tap a tile to open the filtered receipts list.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <AlertTile
            title="Missing BN Numbers"
            count={missingBNCount}
            description="Receipts without a supplier GST or business number."
            tone="danger"
            onClick={() => onFilterClick('missing-bn')}
          />

          <AlertTile
            title="Pending Review"
            count={pendingReviewCount}
            description="Receipts still waiting for owner or accountant review."
            tone="info"
            onClick={() => onFilterClick('pending-review')}
          />

          <AlertTile
            title="Flagged for Audit"
            count={flaggedAuditCount}
            description="Receipts with warnings, thermal risk, or audit-related flags."
            tone="warning"
            onClick={() => onFilterClick('flagged-audit')}
          />
        </div>
      </div>

      <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-white text-blue-500 shadow-sm">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">Quick insight</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              GST recoverable is calculated from the receipt tax field, while the alert tiles surface missing business
              numbers, review backlog, and audit-risk records from the saved receipt metadata.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}