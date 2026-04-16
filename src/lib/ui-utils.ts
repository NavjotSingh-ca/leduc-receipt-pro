export function toNumber(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function formatCurrency(value: number, currency = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currency || 'CAD',
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDate(value?: string | null): string {
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

export function categoryColor(category?: string | null): string {
  const map: Record<string, string> = {
    'Office Supplies': '#bea98e',
    'Meals & Entertainment': '#f59e0b',
    'Meals Entertainment': '#f59e0b',
    Travel: '#8b5cf6',
    Fuel: '#ef4444',
    'Professional Fees': '#10b981',
    Supplies: '#06b6d4',
    'Software & Subscriptions': '#ec4899',
    'Software Subscriptions': '#ec4899',
    Utilities: '#f97316',
    'General Expense': '#6b6560',
  };
  return map[category ?? ''] ?? '#6b6560';
}

export function confidenceTone(score: number): { pill: string; panel: string; label: string } {
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
