'use client';

import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BadgeAlert,
  BarChart3,
  CheckCircle2,
  DollarSign,
  FileSearch,
  Lock,
  Receipt,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AreaChart, BarList, Card, Metric, Text } from '@tremor/react';

import type { ReceiptRow, UserRole } from '@/lib/types';
import {
  toNumber,
  formatCurrency,
  approvalBadge,
  reimbursementBadge,
} from '@/lib/ui-utils';

interface DashboardProps {
  receipts: ReceiptRow[];
  onFilterClick: (filterType: string) => void;
  role?: UserRole;
}

/* ─── Alberta Construction Taxonomy Colors ─── */
const CATEGORY_COLORS = [
  '#bea98e', // Job Materials
  '#8b5cf6', // Subcontractors
  '#ef4444', // Site Fuel
  '#f59e0b', // Equipment Rental
  '#06b6d4', // Small Tools
  '#ec4899', // Vehicle Maintenance
  '#60a5fa', // Travel/Lodging
  '#10b981', // Office/Admin
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
    <Card className="rounded-3xl border border-glass-border bg-surface shadow-sm transition-all duration-200 hover:border-glass-border-hover hover:bg-surface-raised !ring-0">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-champagne/10 text-champagne">
          {icon}
        </div>
      </div>

      <Text className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</Text>
      <Metric className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-text-primary sm:text-3xl">{value}</Metric>
      <Text className="mt-1 text-sm text-text-secondary">{helper}</Text>
    </Card>
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

/* ─── Access Denied Screen (Employee View) ─── */

function AccessDeniedDashboard({ receipts }: { receipts: ReceiptRow[] }) {
  const totalScanned = receipts.length;
  const totalAmount = receipts.reduce((sum, r) => sum + toNumber(r.total_amount), 0);
  const gstTotal = receipts.reduce((sum, r) => sum + toNumber(r.tax_amount), 0);

  return (
    <section className="space-y-6 fade-in">
      <div className="flex flex-col items-center justify-center rounded-3xl border border-glass-border bg-surface p-10 text-center shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-500/10 text-amber-400 mb-4">
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-text-primary">Dashboard Access Restricted</h2>
        <p className="mt-2 max-w-md text-sm text-text-secondary">
          The full dashboard with charts and audit alerts is available to Owners and Accountants only.
          Below are your personal scan statistics.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-3xl border border-glass-border bg-surface p-4 shadow-sm text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">My Scans</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-text-primary">{totalScanned}</p>
        </div>
        <div className="rounded-3xl border border-glass-border bg-surface p-4 shadow-sm text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">My Total</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-champagne">{currencyFormatter.format(totalAmount)}</p>
        </div>
        <div className="rounded-3xl border border-glass-border bg-surface p-4 shadow-sm text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">My GST</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-light">{currencyFormatter.format(gstTotal)}</p>
        </div>
      </div>
    </section>
  );
}

export default function Dashboard({ receipts, onFilterClick, role = 'Owner' }: DashboardProps) {
  /* ─── Employee: Access Denied ─── */
  if (role === 'Employee') {
    return <AccessDeniedDashboard receipts={receipts} />;
  }

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
    reimbursementQueue,
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
    const reimbursementQueue: ReceiptRow[] = [];

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

      if (receipt.paid_by === 'employee_cash' && receipt.reimbursement_status === 'pending') {
        reimbursementQueue.push(receipt);
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
      reimbursementQueue,
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

      {/* Reimbursement Queue (Owner Only) */}
      {role === 'Owner' && reimbursementQueue.length > 0 && (
        <div className="rounded-3xl border border-amber-500/20 bg-amber-500/[0.04] p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-text-primary">Reimbursement Queue</p>
                <p className="mt-0.5 text-xs text-text-secondary">{reimbursementQueue.length} employee claim{reimbursementQueue.length === 1 ? '' : 's'} pending</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onFilterClick('reimbursement')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 transition hover:text-amber-300"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            {reimbursementQueue.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-2xl border border-glass-border bg-surface px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">{r.vendor_name}</p>
                  <p className="text-xs text-text-muted">{r.transaction_date}</p>
                </div>
                <p className="text-sm font-bold tabular-nums text-amber-400">{currencyFormatter.format(toNumber(r.total_amount))}</p>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <div className="mt-4 h-[280px] w-full overflow-y-auto sm:h-[320px]">
              <BarList
                data={spendingByCategory.map(s => ({ name: s.name, value: s.amount }))}
                className="mt-2"
                valueFormatter={(number: number) => currencyFormatter.format(number)}
                showAnimation={true}
              />
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
            <div className="mt-4 h-[280px] w-full sm:h-[320px] dark">
              <AreaChart
                className="mt-4 h-72"
                data={monthlyTrend.map(t => ({ month: formatMonthLabel(t.month), amount: t.amount }))}
                index="month"
                categories={['amount']}
                colors={['amber']}
                valueFormatter={(number: number) => currencyFormatter.format(number)}
                showAnimation={true}
                showLegend={false}
              />
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