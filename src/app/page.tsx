'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  Download,
  LayoutDashboard,
  Layers,
  Loader2,
  LogOut,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  UserCircle2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import Dashboard from '@/components/Dashboard';
import Export from '@/components/Export';
import History from '@/components/History';
import Scanner from '@/components/Scanner';
import AuditTrail from '@/components/AuditTrail';
import { supabase } from '@/lib/supabase';
import type { ReceiptRow, UserRole } from '@/lib/types';
import type { User } from '@supabase/supabase-js';

type Tab = 'dashboard' | 'receipts' | 'scan' | 'export' | 'audit';

type ToastState = {
  type: 'success' | 'error' | 'info';
  msg: string;
};

/* ─── Helpers ─── */

function normalizeLineItems(rawValue: unknown): unknown[] | Record<string, unknown> | string | null {
  if (rawValue === null || rawValue === undefined) return null;
  if (Array.isArray(rawValue)) return rawValue;
  if (typeof rawValue === 'object') return rawValue as Record<string, unknown>;
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
      return trimmed;
    } catch {
      return trimmed;
    }
  }
  return null;
}

function normalizeReceipt(raw: Record<string, unknown>): ReceiptRow {
  return {
    id: String(raw?.id ?? ''),
    user_id: String(raw?.user_id ?? ''),
    vendor_name: (raw?.vendor_name as string) ?? '',
    vendor_address: (raw?.vendor_address as string) ?? '',
    vendor_tax_number: (raw?.vendor_tax_number as string) ?? '',
    transaction_date: (raw?.transaction_date as string) ?? '',
    transaction_time: (raw?.transaction_time as string) ?? '',
    subtotal: Number(raw?.subtotal ?? 0),
    tax_amount: Number(raw?.tax_amount ?? 0),
    pst_amount: Number(raw?.pst_amount ?? 0),
    total_amount: Number(raw?.total_amount ?? 0),
    currency: (raw?.currency as string) ?? 'CAD',
    payment_method: (raw?.payment_method as string) ?? '',
    card_last_four: (raw?.card_last_four as string) ?? '',
    category: (raw?.category as string) ?? '',
    notes: (raw?.notes as string) ?? '',
    job_code: (raw?.job_code as string) ?? '',
    vehicle_id: (raw?.vehicle_id as string) ?? '',
    usage_type: (raw?.usage_type as ReceiptRow['usage_type']) ?? null,
    business_use_percent: Number(raw?.business_use_percent ?? 0),
    line_items: normalizeLineItems(raw?.line_items ?? null) as ReceiptRow['line_items'],
    integrity_hash: (raw?.integrity_hash as string) ?? '',
    confidence_score: Number(raw?.confidence_score ?? 0),
    cra_readiness_score: Number(raw?.cra_readiness_score ?? 0),
    thermal_warning: Boolean(raw?.thermal_warning ?? false),
    capture_source: (raw?.capture_source as string) ?? '',
    image_url: (raw?.image_url as string) ?? null,
    is_deleted: Boolean(raw?.is_deleted ?? false),
    created_at: (raw?.created_at as string) ?? '',
    paid_by: (raw?.paid_by as string) ?? null,
    reimbursement_status: (raw?.reimbursement_status as string) ?? null,
    needs_reimbursement: Boolean(raw?.needs_reimbursement ?? false),
    approval_status: (raw?.approval_status as string) ?? null,
  };
}

/* ─── Currency Formatter ─── */

const cad = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 2,
});

/* ─── Liquid Glass Spring Transition ─── */

const tabTransition = {
  type: 'spring' as const,
  stiffness: 260,
  damping: 20,
};

const tabVariants = {
  initial: { opacity: 0, y: 16, scale: 0.97, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -12, scale: 0.96, filter: 'blur(4px)' },
};

/* ─── Loader ─── */

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-obsidian">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-champagne/15 champagne-glow">
          <ReceiptText className="h-8 w-8 text-champagne" />
        </div>
        <Loader2 className="h-6 w-6 animate-spin text-champagne" />
        <p className="text-sm font-medium text-text-secondary">Loading Receipt Pro…</p>
      </div>
    </div>
  );
}

/* ─── Auth Screen ─── */

function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = (type: ToastState['type'], msg: string) => {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 4200);
  };

  const handleSubmit = async () => {
    if (!email || !password) {
      showToast('error', 'Please enter your email and password.');
      return;
    }
    if (!accepted) {
      showToast('error', 'Please accept the terms to continue.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showToast('success', 'Signed in successfully.');
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        showToast('success', 'Account created. Please check your email to confirm.');
      }
    } catch (error: unknown) {
      showToast('error', error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-obsidian">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(190,169,142,0.12),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(13,76,60,0.10),transparent_35%)]" />

      {toast && (
        <div
          className={`fixed left-1/2 top-6 z-50 flex w-[92%] max-w-sm -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-2xl ${
            toast.type === 'error'
              ? 'bg-red-500/90'
              : toast.type === 'info'
              ? 'bg-blue-500/90'
              : 'bg-emerald-600/90'
          } backdrop-blur-xl`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-10">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-glass-border bg-white/[0.03] shadow-2xl backdrop-blur-xl lg:grid-cols-2">
          {/* Left Hero */}
          <div className="hidden flex-col justify-between bg-gradient-to-br from-surface via-surface-raised to-obsidian p-10 text-text-primary lg:flex">
            <div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-champagne/15">
                <ReceiptText className="h-7 w-7 text-champagne" />
              </div>
              <h1 className="mt-8 text-4xl font-bold tracking-tight">Receipt Pro</h1>
              <p className="mt-3 max-w-md text-sm leading-7 text-text-secondary">
                Canadian receipt capture, CRA-ready exports, audit integrity, and accountant handoff in one clean workflow.
              </p>
            </div>

            <div className="space-y-4 text-sm text-text-secondary">
              <div className="rounded-2xl border border-glass-border bg-white/[0.04] p-4">
                SHA-256 integrity tracking, export logbooks, and structured expense records built for professional recordkeeping.
              </div>
              <div className="rounded-2xl border border-glass-border bg-white/[0.04] p-4">
                Scanner, dashboard, history, export, and audit modules in one shell.
              </div>
            </div>
          </div>

          {/* Right Form */}
          <div className="bg-surface p-6 sm:p-10">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8 text-center lg:text-left">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-champagne/15 champagne-glow lg:mx-0">
                  <ReceiptText className="h-8 w-8 text-champagne" />
                </div>
                <h2 className="mt-6 text-3xl font-bold tracking-tight text-text-primary">
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </h2>
                <p className="mt-2 text-sm text-text-secondary">
                  {mode === 'signin'
                    ? 'Access your receipts, exports, and audit records.'
                    : 'Start capturing and organizing receipts securely.'}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-glass-border bg-surface-raised px-4 py-3 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-champagne/40 focus:ring-2 focus:ring-champagne/15"
                    placeholder="you@company.ca"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    className="w-full rounded-2xl border border-glass-border bg-surface-raised px-4 py-3 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-champagne/40 focus:ring-2 focus:ring-champagne/15"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setAccepted((v) => !v)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
                    accepted
                      ? 'border-champagne/30 bg-champagne/[0.06]'
                      : 'border-glass-border bg-surface-raised hover:border-glass-border-hover'
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${
                      accepted ? 'border-champagne bg-champagne text-obsidian' : 'border-text-muted bg-surface'
                    }`}
                  >
                    {accepted && <CheckCircle2 className="h-3.5 w-3.5" />}
                  </div>
                  <p className="text-xs leading-6 text-text-secondary">
                    I understand Receipt Pro is a recordkeeping tool and I remain responsible for reviewing exported tax and accounting data.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || !accepted}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-champagne px-4 py-3.5 text-sm font-bold text-obsidian shadow-lg transition hover:bg-champagne-dim disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                </button>

                <button
                  type="button"
                  onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
                  className="w-full text-sm font-medium text-champagne transition hover:text-champagne-dim"
                >
                  {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Audit HUD ─── */

function AuditHUD({ receipts }: { receipts: ReceiptRow[] }) {
  const { gstRecoverable, monthLabel, receiptCount } = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthReceipts = receipts.filter((r) => (r.transaction_date ?? '').startsWith(currentMonth));

    const gstRecoverable = monthReceipts.reduce((sum, r) => sum + Number(r.tax_amount ?? 0), 0);
    const monthLabel = now.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });

    return { gstRecoverable, monthLabel, receiptCount: monthReceipts.length };
  }, [receipts]);

  return (
    <div className="liquid-glass rounded-2xl px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-success/30">
            <TrendingUp className="h-4 w-4 text-emerald-light" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
              {monthLabel} · Tax Recoverable
            </p>
            <p className="text-lg font-bold tracking-tight text-champagne tabular-nums">
              {cad.format(gstRecoverable)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-text-muted">{receiptCount} receipts</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */

export default function Page() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(true);
  const [roleOpen, setRoleOpen] = useState(false);
  const [role, setRole] = useState<UserRole>('Owner');
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((type: ToastState['type'], msg: string) => {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  /* ─── Role-aware tab enforcement ─── */
  useEffect(() => {
    if (role === 'Employee') {
      if (activeTab === 'dashboard' || activeTab === 'export' || activeTab === 'audit') {
        setActiveTab('scan');
      }
    }
  }, [role, activeTab]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = user?.id;

  const fetchReceipts = useCallback(async () => {
    if (!userId) return;

    setReceiptsLoading(true);

    try {
      const queryReq = supabase
        .from('receipts')
        .select(`
          id,
          user_id,
          vendor_name,
          vendor_address,
          vendor_tax_number,
          transaction_date,
          transaction_time,
          subtotal,
          tax_amount,
          pst_amount,
          total_amount,
          currency,
          payment_method,
          card_last_four,
          category,
          notes,
          job_code,
          vehicle_id,
          usage_type,
          business_use_percent,
          line_items,
          integrity_hash,
          confidence_score,
          cra_readiness_score,
          thermal_warning,
          needs_reimbursement,
          approval_status,
          paid_by,
          reimbursement_status,
          capture_source,
          image_url,
          is_deleted,
          created_at
        `)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (role === 'Employee') {
        queryReq.eq('user_id', userId);
      }

      const { data, error } = await queryReq;

      if (error) throw error;

      const safeRows = Array.isArray(data) ? data.map((row) => normalizeReceipt(row as Record<string, unknown>)) : [];
      setReceipts(safeRows);
    } catch (error: unknown) {
      setReceipts([]);
      showToast(
        'error',
        error instanceof Error ? `Failed to load receipts: ${error.message}` : 'Failed to load receipts.'
      );
    } finally {
      setReceiptsLoading(false);
    }
  }, [userId, role, showToast]);

  useEffect(() => {
    if (!userId) {
      setReceipts([]);
      setReceiptsLoading(false);
      return;
    }

    fetchReceipts();
  }, [userId, role, fetchReceipts]);

  const handleFilterClick = useCallback((filter: string) => {
    setActiveFilter(filter);
    setActiveTab('receipts');
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setRoleOpen(false);
    setActiveTab('dashboard');
    setActiveFilter('all');
  };

  if (authLoading) return <FullPageLoader />;
  if (!user) return <AuthScreen />;

  const navItems: Array<{
    id: Tab;
    label: string;
    icon: React.ReactNode;
    primary?: boolean;
  }> = [
    { id: 'dashboard', label: 'Dash', icon: <LayoutDashboard className="h-5 w-5" /> },
    { id: 'receipts', label: 'Records', icon: <ReceiptText className="h-5 w-5" /> },
    { id: 'scan', label: 'Scan', icon: <Camera className="h-6 w-6" />, primary: true },
    { id: 'export', label: 'Export', icon: <Download className="h-5 w-5" /> },
    { id: 'audit', label: 'Audit', icon: <ShieldCheck className="h-5 w-5" /> },
  ];

  return (
    <div className="min-h-screen bg-obsidian text-text-primary">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className={`fixed left-1/2 top-4 z-[80] flex w-[92%] max-w-sm -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-2xl backdrop-blur-xl ${
              toast.type === 'error'
                ? 'bg-red-500/90'
                : toast.type === 'info'
                ? 'bg-blue-500/90'
                : 'bg-emerald-600/90'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <span>{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-50 liquid-glass">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-champagne/15 champagne-glow">
              <ReceiptText className="h-5 w-5 text-champagne" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-text-primary">Receipt Pro</h1>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-champagne">
                CRA-ready records
              </p>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setRoleOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full border border-glass-border bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition hover:border-glass-border-hover hover:bg-surface-raised"
            >
              <UserCircle2 className="h-4 w-4 text-champagne" />
              <span>Role: {role}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-text-muted transition ${roleOpen ? 'rotate-180' : ''}`}
              />
            </button>

            <AnimatePresence>
              {roleOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="absolute right-0 top-12 z-50 w-48 rounded-2xl border border-glass-border bg-surface p-2 shadow-2xl"
                >
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
                    Switch Role
                  </p>

                  {(['Owner', 'Employee', 'Accountant'] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setRole(item);
                        setRoleOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                        role === item ? 'bg-champagne/10 text-champagne' : 'text-text-secondary hover:bg-surface-raised'
                      }`}
                    >
                      <Layers className="h-4 w-4" />
                      <span>{item}</span>
                      {role === item && <CheckCircle2 className="ml-auto h-4 w-4 text-champagne" />}
                    </button>
                  ))}

                  <div className="mt-2 border-t border-glass-border pt-2">
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-text-secondary transition hover:bg-red-500/10 hover:text-red-400"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-24 sm:px-6 relative overflow-hidden">
        {/* Audit HUD */}
        {!receiptsLoading && receipts.length > 0 && role !== 'Employee' && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={tabTransition}
            className="mb-5"
          >
            <AuditHUD receipts={receipts} />
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {receiptsLoading ? (
            <motion.div 
              key="loader"
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={tabTransition}
              className="flex min-h-[50vh] flex-col items-center justify-center gap-4"
            >
              <Loader2 className="h-9 w-9 animate-spin text-champagne" />
              <p className="text-sm font-medium text-text-secondary">Loading your workspace…</p>
            </motion.div>
          ) : activeTab === 'dashboard' ? (
            <motion.div 
              key="dashboard"
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={tabTransition}
            >
              <Dashboard receipts={receipts} onFilterClick={handleFilterClick} role={role} />
            </motion.div>
          ) : activeTab === 'receipts' ? (
            <motion.div 
              key="receipts"
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={tabTransition}
            >
              <History receipts={receipts} activeFilter={activeFilter} onUpdate={fetchReceipts} role={role} />
            </motion.div>
          ) : activeTab === 'scan' ? (
            <motion.div 
              key="scan"
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={tabTransition}
            >
              <Scanner
                user={user}
                onSaveSuccess={async () => {
                  await fetchReceipts();
                  setActiveTab('receipts');
                  showToast('success', 'Receipt saved successfully.');
                }}
              />
            </motion.div>
          ) : activeTab === 'export' ? (
            <motion.div 
              key="export"
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={tabTransition}
            >
              <Export receipts={receipts} />
            </motion.div>
          ) : (
            <motion.div 
              key="audit"
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={tabTransition}
            >
              <AuditTrail />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-50 liquid-glass">
        <div className="mx-auto flex max-w-6xl items-end justify-around px-2 py-2 sm:px-4">
          {navItems.map((item) => {
            /* Employee: hide dashboard, export, audit */
            if (role === 'Employee' && (item.id === 'dashboard' || item.id === 'export' || item.id === 'audit')) {
              return null;
            }
            /* Accountant: hide audit */
            if (role === 'Accountant' && item.id === 'audit') {
              return null;
            }
            return item.primary ? (
              <div key={item.id} className="relative -mt-6 flex flex-col items-center gap-1">
                <motion.button
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  whileTap={{ scale: 0.88 }}
                  whileHover={{ scale: 1.06 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  className={`flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition ${
                    activeTab === item.id
                      ? 'bg-emerald-success text-white shadow-emerald-success/30'
                      : 'bg-emerald-success/80 text-white shadow-emerald-success/20 hover:bg-emerald-success'
                  }`}
                >
                  {item.icon}
                </motion.button>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-light">
                  {item.label}
                </span>
              </div>
            ) : (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex min-w-[64px] flex-col items-center gap-1 rounded-2xl px-3 py-2 transition ${
                  activeTab === item.id ? 'text-champagne' : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Role menu backdrop */}
      {roleOpen && (
        <button
          type="button"
          aria-label="Close role menu"
          className="fixed inset-0 z-40 cursor-default"
          onClick={() => setRoleOpen(false)}
        />
      )}
    </div>
  );
}