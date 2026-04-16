/* ─── UI Utilities — Receipt Pro v4.0 ─── */

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

/* ─── Alberta Construction Taxonomy Colors ─── */

export function categoryColor(category?: string | null): string {
  const map: Record<string, string> = {
    'Job Materials': '#bea98e',
    'Subcontractors': '#8b5cf6',
    'Site Fuel': '#ef4444',
    'Equipment Rental': '#f59e0b',
    'Small Tools': '#06b6d4',
    'Vehicle Maintenance': '#ec4899',
    'Travel/Lodging': '#60a5fa',
    'Office/Admin': '#10b981',
    // Legacy fallbacks
    'Office Supplies': '#10b981',
    'Meals & Entertainment': '#f59e0b',
    Travel: '#60a5fa',
    Fuel: '#ef4444',
    'Professional Fees': '#8b5cf6',
    Supplies: '#06b6d4',
    'Software & Subscriptions': '#ec4899',
    Utilities: '#f97316',
    'General Expense': '#6b6560',
  };
  return map[category ?? ''] ?? '#6b6560';
}

/* ─── AI Confidence Tone ─── */

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

/* ─── Approval Status Badge ─── */

export function approvalBadge(status?: string | null): { cls: string; label: string } {
  const s = (status ?? '').toLowerCase();
  if (s === 'approved') {
    return { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', label: 'Approved' };
  }
  if (s === 'rejected') {
    return { cls: 'bg-red-500/15 text-red-400 border-red-500/20', label: 'Rejected' };
  }
  return { cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20', label: 'Submitted' };
}

/* ─── Reimbursement Badge ─── */

export function reimbursementBadge(status?: string | null): { cls: string; label: string } {
  const s = (status ?? '').toLowerCase();
  if (s === 'approved') {
    return { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', label: 'Reimbursed' };
  }
  if (s === 'rejected') {
    return { cls: 'bg-red-500/15 text-red-400 border-red-500/20', label: 'Denied' };
  }
  return { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20', label: 'Pending' };
}

/* ─── Self-Healing Glow ─── */

export function shouldGlow(confidenceScore: number): boolean {
  return confidenceScore > 0 && confidenceScore < 80;
}

/* ─── Real-Time CRA Readiness Computation ─── */

export function computeLiveCRAScore(form: {
  vendor_name: string;
  vendor_address: string;
  business_number: string;
  transaction_date: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  pst_amount: number;
  payment_method: string;
  notes: string;
  line_items: unknown[];
}): number {
  let score = 0;

  if (form.vendor_name.trim()) score += 15;
  if (form.vendor_address.trim()) score += 8;
  if (form.business_number.trim()) score += 18;
  if (form.transaction_date.trim()) score += 12;
  if (form.total_amount > 0) score += 12;
  if (form.subtotal > 0) score += 8;
  if (form.tax_amount >= 0) score += 7;
  if (form.payment_method && form.payment_method !== 'Unknown') score += 5;
  if (form.notes.split(/\s+/).filter(Boolean).length >= 8) score += 5;
  if (form.line_items.length > 0) score += 6;

  const mathMismatch =
    Math.abs(form.subtotal + form.tax_amount + form.pst_amount - form.total_amount) > 0.02;
  if (mathMismatch && form.total_amount > 0) score -= 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}
