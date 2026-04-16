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

import type { ReceiptRow } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import {
  toNumber,
  formatCurrency,
  formatDate,
  categoryColor,
  confidenceTone,
} from '@/lib/ui-utils';

interface DashboardProps {
  receipts: ReceiptRow[];
  onFilterClick: (filterType: string) => void;
}

const CATEGORY_COLORS = [
  '#bea98e',
  '#a89070',
  '#0d4c3c',
  '#10b981',
  '#60a5fa',
  '#8b5cf6',
  '#f59e0b',
  '#ef4444',
];

const currencyFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 2,
});

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
    <div className="rounded-2xl border border-glass-border bg-surface px-4 py-3 shadow-xl">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="text-sm font-bold tabular-nums text-champagne">{currencyFormatter.format(toNumber(payload[0].value))}</p>
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
    <div className="rounded-3xl border border-glass-border bg-surface p-4 shadow-sm transition-all duration-200 hover:border-glass-border-hover hover:bg-surface-raised sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-champagne/10 text-champagne">
          {icon}
        </div>
      </div>

      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-text-primary sm:text-3xl">{value}</p>
      <p className="mt-1 text-sm text-text-secondary">{helper}</p>
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
      wrap: 'border-red-500/20 bg-red-500/[0.06] hover:bg-red-500/[0.10]',
      icon: 'bg-red-500/15 text-red-400',
      badge: 'bg-red-500/15 text-red-400',
      arrow: 'text-red-400',
    },
    info: {
      wrap: 'border-blue-500/20 bg-blue-500/[0.06] hover:bg-blue-500/[0.10]',
      icon: 'bg-blue-500/15 text-blue-400',
      badge: 'bg-blue-500/15 text-blue-400',
      arrow: 'text-blue-400',
    },
    warning: {
      wrap: 'border-amber-500/20 bg-amber-500/[0.06] hover:bg-amber-500/[0.10]',
      icon: 'bg-amber-500/15 text-amber-400',
      badge: 'bg-amber-500/15 text-amber-400',
      arrow: 'text-amber-400',
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
            <p className="text-sm font-bold text-text-primary">{title}</p>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${toneMap.badge}`}>{count}</span>
          </div>

          <p className="mt-1 text-sm leading-relaxed text-text-secondary">{description}</p>
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
    const totalSpent = receipts.reduce((sum, r) => sum + toNumber(r.total_amount), 0);
    const gstRecoverable = receipts.reduce((sum, r) => sum + toNumber(r.tax_amount), 0);
    const receiptCount = receipts.length;
    const avgTransaction = receiptCount > 0 ? totalSpent / receiptCount : 0;

    const categoryMap = new Map<string, number>();
    const monthMap = new Map<string, number>();

    let missingBNCount = 0;
    let pendingReviewCount = 0;
    let flaggedAuditCount = 0;

    for (const receipt of receipts) {
      const category = String(receipt.category ?? 'Uncategorized').trim() || 'Uncategorized';
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + toNumber(receipt.total_amount));

      const fullDate = String(receipt.transaction_date ?? '').trim();
      if (fullDate.length >= 7) {
        const monthKey = fullDate.slice(0, 7);
        monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + toNumber(receipt.total_amount));
      }

      const bn = String(receipt.vendor_tax_number ?? '').trim();
      if (!bn || receipt.missing_bn_warning) {
        missingBNCount += 1;
      }

      const reviewRaw = String(receipt.review_status ?? receipt.accountant_status ?? '').toLowerCase();
      if (
        receipt.needs_review ||
        reviewRaw.includes('pending') ||
        reviewRaw.includes('review')
      ) {
        pendingReviewCount += 1;
      }

      if (
        receipt.flagged_for_audit ||
        receipt.math_mismatch_warning ||
        receipt.duplicate_warning ||
        receipt.thermal_warning ||
        (toNumber(receipt.cra_readiness_score) > 0 && toNumber(receipt.cra_readiness_score) < 70)
      ) {
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
    <section className="space-y-6 fade-in">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-champagne">Business overview</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">Dashboard</h2>
        </div>

        <div className="hidden rounded-2xl border border-glass-border bg-surface px-3 py-2 text-xs font-medium text-text-secondary shadow-sm sm:block">
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
        <div className="rounded-3xl border border-glass-border bg-surface p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-text-primary">Spending by Category</p>
              <p className="mt-1 text-xs text-text-secondary">Top expense buckets across all receipts</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-champagne/10 text-champagne">
              <BarChart3 className="h-5 w-5" />
            </div>
          </div>

          {spendingByCategory.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-glass-border bg-surface-raised text-center">
              <div>
                <p className="text-sm font-semibold text-text-secondary">No category data yet</p>
                <p className="mt-1 text-xs text-text-muted">Scan and save receipts to populate this chart.</p>
              </div>
            </div>
          ) : (
            <div className="h-[280px] w-full sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={spendingByCategory} margin={{ top: 8, right: 8, left: -24, bottom: 8 }}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#6b6560' }}
                    interval={0}
                    angle={spendingByCategory.length > 4 ? -20 : 0}
                    textAnchor={spendingByCategory.length > 4 ? 'end' : 'middle'}
                    height={spendingByCategory.length > 4 ? 52 : 30}
                    tickFormatter={(value: string) => (value.length > 14 ? `${value.slice(0, 14)}…` : value)}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#6b6560' }}
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

        <div className="rounded-3xl border border-glass-border bg-surface p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-text-primary">Monthly Spending Trend</p>
              <p className="mt-1 text-xs text-text-secondary">Spend movement over time</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-champagne/10 text-champagne">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>

          {monthlyTrend.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-glass-border bg-surface-raised text-center">
              <div>
                <p className="text-sm font-semibold text-text-secondary">No monthly trend yet</p>
                <p className="mt-1 text-xs text-text-muted">Receipts with transaction dates will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="h-[280px] w-full sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrend} margin={{ top: 8, right: 8, left: -24, bottom: 8 }}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#6b6560' }}
                    tickFormatter={formatMonthLabel}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#6b6560' }}
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
                    stroke="#bea98e"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#bea98e', stroke: '#0c0c0c', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#bea98e', stroke: '#0c0c0c', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-glass-border bg-surface p-4 shadow-sm sm:p-5">
        <div className="mb-4">
          <p className="text-sm font-bold text-text-primary">Actionable alerts</p>
          <p className="mt-1 text-xs text-text-secondary">Tap a tile to open the filtered receipts list.</p>
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

      <div className="rounded-3xl border border-champagne/15 bg-champagne/[0.04] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-champagne/10 text-champagne shadow-sm">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary">Quick insight</p>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              GST recoverable is calculated from the receipt tax field, while the alert tiles surface missing business
              numbers, review backlog, and audit-risk records from the saved receipt metadata.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}