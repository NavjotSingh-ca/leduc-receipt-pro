'use client';

import { useCallback, useEffect, useState } from 'react';
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
  Receipt,
  ReceiptText,
  ShieldCheck,
  UserCircle2,
} from 'lucide-react';

import Dashboard from '@/components/Dashboard';
import Export from '@/components/Export';
import History from '@/components/History';
import Scanner from '@/components/Scanner';
import AuditTrail from '@/components/AuditTrail';
import { supabase } from '@/lib/supabase';

type Tab = 'dashboard' | 'receipts' | 'scan' | 'export' | 'audit';

type ReceiptRow = {
  id: string;
  user_id: string;
  vendor_name: string;
  vendor_address: string;
  vendor_tax_number: string;
  transaction_date: string;
  transaction_time: string;
  subtotal: number;
  tax_amount: number;
  pst_amount: number;
  total_amount: number;
  currency: string;
  payment_method: string;
  card_last_four: string;
  category: string;
  notes: string;
  job_code: string;
  vehicle_id: string;
  usage_type: string;
  business_use_percent: number;
  line_items: unknown[] | Record<string, unknown> | string | null;
  integrity_hash: string;
  confidence_score: number;
  cra_readiness_score: number;
  thermal_warning: boolean;
  capture_source: string;
  device_info: string;
  is_deleted: boolean;
  created_at: string;
};

type ToastState = {
  type: 'success' | 'error' | 'info';
  msg: string;
};

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

function normalizeReceipt(raw: any): ReceiptRow {
  return {
    id: String(raw?.id ?? ''),
    user_id: String(raw?.user_id ?? ''),
    vendor_name: raw?.vendor_name ?? '',
    vendor_address: raw?.vendor_address ?? '',
    vendor_tax_number: raw?.vendor_tax_number ?? '',
    transaction_date: raw?.transaction_date ?? '',
    transaction_time: raw?.transaction_time ?? '',
    subtotal: Number(raw?.subtotal ?? 0),
    tax_amount: Number(raw?.tax_amount ?? 0),
    pst_amount: Number(raw?.pst_amount ?? 0),
    total_amount: Number(raw?.total_amount ?? 0),
    currency: raw?.currency ?? 'CAD',
    payment_method: raw?.payment_method ?? '',
    card_last_four: raw?.card_last_four ?? '',
    category: raw?.category ?? '',
    notes: raw?.notes ?? '',
    job_code: raw?.job_code ?? '',
    vehicle_id: raw?.vehicle_id ?? '',
    usage_type: raw?.usage_type ?? '',
    business_use_percent: Number(raw?.business_use_percent ?? 0),
    line_items: normalizeLineItems(raw?.line_items ?? null),
    integrity_hash: raw?.integrity_hash ?? '',
    confidence_score: Number(raw?.confidence_score ?? 0),
    cra_readiness_score: Number(raw?.cra_readiness_score ?? 0),
    thermal_warning: Boolean(raw?.thermal_warning ?? false),
    capture_source: raw?.capture_source ?? '',
    device_info: raw?.device_info ?? '',
    is_deleted: Boolean(raw?.is_deleted ?? false),
    created_at: raw?.created_at ?? '',
  };
}

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-600 shadow-xl shadow-blue-200">
          <ReceiptText className="h-8 w-8 text-white" />
        </div>
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-slate-500">Loading Receipt Pro...</p>
      </div>
    </div>
  );
}

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
    } catch (error: any) {
      showToast('error', error?.message ?? 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.25),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(148,163,184,0.18),transparent_30%)]" />

      {toast && (
        <div
          className={`fixed left-1/2 top-6 z-50 flex w-[92%] max-w-sm -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-2xl ${
            toast.type === 'error'
              ? 'bg-red-500'
              : toast.type === 'info'
              ? 'bg-blue-500'
              : 'bg-emerald-500'
          }`}
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
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl backdrop-blur-xl lg:grid-cols-2">
          <div className="hidden flex-col justify-between bg-gradient-to-br from-blue-700 to-slate-900 p-10 text-white lg:flex">
            <div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                <ReceiptText className="h-7 w-7" />
              </div>
              <h1 className="mt-8 text-4xl font-bold tracking-tight">Receipt Pro</h1>
              <p className="mt-3 max-w-md text-sm leading-7 text-blue-100">
                Canadian receipt capture, CRA-ready exports, audit integrity, and accountant handoff in one clean workflow.
              </p>
            </div>

            <div className="space-y-4 text-sm text-blue-50/90">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                SHA-256 integrity tracking, export logbooks, and structured expense records built for professional recordkeeping.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                Scanner, dashboard, history, export, and audit modules in one shell.
              </div>
            </div>
          </div>

          <div className="bg-white p-6 sm:p-10">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8 text-center lg:text-left">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-600 shadow-lg shadow-blue-100 lg:mx-0">
                  <ReceiptText className="h-8 w-8 text-white" />
                </div>
                <h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  {mode === 'signin'
                    ? 'Access your receipts, exports, and audit records.'
                    : 'Start capturing and organizing receipts securely.'}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    placeholder="you@company.ca"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setAccepted((v) => !v)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
                    accepted
                      ? 'border-blue-200 bg-blue-50'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${
                      accepted ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                    }`}
                  >
                    {accepted && <CheckCircle2 className="h-3.5 w-3.5" />}
                  </div>
                  <p className="text-xs leading-6 text-slate-600">
                    I understand Receipt Pro is a recordkeeping tool and I remain responsible for reviewing exported tax and accounting data.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || !accepted}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                </button>

                <button
                  type="button"
                  onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
                  className="w-full text-sm font-medium text-blue-600 transition hover:text-blue-700"
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

export default function Page() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<any | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(true);
  const [roleOpen, setRoleOpen] = useState(false);
  const [role, setRole] = useState<'Owner' | 'Employee' | 'Accountant'>('Owner');
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((type: ToastState['type'], msg: string) => {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

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

  const fetchReceipts = useCallback(async () => {
    if (!user?.id) return;

    setReceiptsLoading(true);

    try {
      const { data, error } = await supabase
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
          capture_source,
          device_info,
          is_deleted,
          created_at
        `)
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const safeRows = Array.isArray(data) ? data.map((row) => normalizeReceipt(row)) : [];
      setReceipts(safeRows);
    } catch (error: any) {
      console.error('fetchReceipts failed:', {
        message: error?.message ?? 'Unknown error',
        details: error?.details ?? '',
        hint: error?.hint ?? '',
        code: error?.code ?? '',
        full: error,
      });
      setReceipts([]);
      showToast(
        'error',
        error?.message ? `Failed to load receipts: ${error.message}` : 'Failed to load receipts.'
      );
    } finally {
      setReceiptsLoading(false);
    }
  }, [user?.id, showToast]);

  useEffect(() => {
    if (!user?.id) {
      setReceipts([]);
      setReceiptsLoading(false);
      return;
    }

    fetchReceipts();
  }, [user?.id, fetchReceipts]);

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
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
    { id: 'receipts', label: 'Receipts', icon: <Receipt className="h-5 w-5" /> },
    { id: 'scan', label: 'Scan', icon: <Camera className="h-6 w-6" />, primary: true },
    { id: 'export', label: 'Export', icon: <Download className="h-5 w-5" /> },
    { id: 'audit', label: 'Audit', icon: <ShieldCheck className="h-5 w-5" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {toast && (
        <div
          className={`fixed left-1/2 top-4 z-[80] flex w-[92%] max-w-sm -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-2xl ${
            toast.type === 'error'
              ? 'bg-red-500'
              : toast.type === 'info'
              ? 'bg-blue-500'
              : 'bg-emerald-500'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}

      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 shadow-md shadow-blue-100">
              <ReceiptText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900">Receipt Pro</h1>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">
                CRA-ready records
              </p>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setRoleOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              <UserCircle2 className="h-4 w-4 text-blue-600" />
              <span>Role: {role}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-400 transition ${roleOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {roleOpen && (
              <div className="absolute right-0 top-12 z-50 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
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
                      role === item ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Layers className="h-4 w-4" />
                    <span>{item}</span>
                    {role === item && <CheckCircle2 className="ml-auto h-4 w-4 text-blue-600" />}
                  </button>
                ))}

                <div className="mt-2 border-t border-slate-100 pt-2">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-24 sm:px-6">
        {receiptsLoading ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
            <Loader2 className="h-9 w-9 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-slate-500">Loading your receipts...</p>
          </div>
        ) : activeTab === 'dashboard' ? (
          <Dashboard receipts={receipts as any} onFilterClick={handleFilterClick} />
        ) : activeTab === 'receipts' ? (
          <History receipts={receipts as any} activeFilter={activeFilter} onUpdate={fetchReceipts} />
        ) : activeTab === 'scan' ? (
          <Scanner
            user={user}
            onSaveSuccess={async () => {
              await fetchReceipts();
              setActiveTab('receipts');
              showToast('success', 'Receipt saved successfully.');
            }}
          />
        ) : activeTab === 'export' ? (
          <Export receipts={receipts as any} />
        ) : (
          <AuditTrail />
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-end justify-around px-2 py-2 sm:px-4">
          {navItems.map((item) =>
            item.primary ? (
              <div key={item.id} className="relative -mt-6 flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition ${
                    activeTab === item.id
                      ? 'bg-blue-700 text-white shadow-blue-200'
                      : 'bg-blue-600 text-white shadow-blue-100 hover:bg-blue-700'
                  }`}
                >
                  {item.icon}
                </button>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">
                  {item.label}
                </span>
              </div>
            ) : (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex min-w-[64px] flex-col items-center gap-1 rounded-2xl px-3 py-2 transition ${
                  activeTab === item.id ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                  {item.label}
                </span>
              </button>
            )
          )}
        </div>
      </nav>

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