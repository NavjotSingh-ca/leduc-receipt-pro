'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  Menu,
  MoreHorizontal,
  Settings,
  Scale,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  UserCircle2,
  Fingerprint,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import Dashboard from '@/components/Dashboard';
import Export from '@/components/Export';
import History from '@/components/History';
import Scanner from '@/components/Scanner';
import AuditTrail from '@/components/AuditTrail';
import BankReconciliation from '@/components/BankReconciliation';
import CommandPalette from '@/components/CommandPalette';
import { AuroraBackground } from '@/components/aceternity/aurora-background';
import { Marquee } from '@/components/magicui/marquee';
import { supabase } from '@/lib/supabase';
import type { ReceiptRow, UserRole } from '@/lib/types';
import type { User } from '@supabase/supabase-js';
import { getReceipts, getBusinessUnits, getAuditLogs } from '@/lib/services/receipts';
import { getUserRole } from '@/lib/services/roles';
type Tab = 'dashboard' | 'receipts' | 'scan' | 'export' | 'audit' | 'reconcile' | 'more';

type ToastState = {
  type: 'success' | 'error' | 'info';
  msg: string;
};

/* ─── Helpers ─── */

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
  initial: { opacity: 0, x: 20, filter: 'blur(8px)' },
  animate: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, x: -20, filter: 'blur(8px)' },
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
        <p className="text-sm font-medium text-text-secondary">Loading Telos Labs…</p>
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
  const [passkeyLoading, setPasskeyLoading] = useState(false);
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
    if (!accepted && mode === 'signup') {
      showToast('error', 'Please accept the terms to create an account.');
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

  const handlePasskeySignIn = async () => {
    setPasskeyLoading(true);
    try {
      // NOTE: User must have previously registered a WebAuthn device in Supabase 
      // via supabase.auth.mfa.enroll({ factorType: 'webauthn' })
      const { error } = await (supabase.auth as any).signInWithWebAuthn();
      if (error) {
        if (error.message.includes('not supported') || error.message.includes('No passkey')) {
          showToast('error', 'Passkeys are not configured for this device or account.');
        } else {
          throw error;
        }
      } else {
        showToast('success', 'Biometric login successful.');
      }
    } catch (error: unknown) {
      showToast('error', error instanceof Error ? error.message : 'Passkey login failed.');
    } finally {
      setPasskeyLoading(false);
    }
  };

  const FeatureCard = ({ title, desc, icon: Icon }: any) => (
    <div className="flex w-64 flex-col items-start gap-2 rounded-[2rem] border border-glass-border bg-black/40 p-5 shadow-2xl backdrop-blur-2xl">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-champagne/15 text-champagne">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-bold text-text-primary">{title}</h3>
      <p className="text-xs text-text-secondary">{desc}</p>
    </div>
  );

  return (
    <AuroraBackground>
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

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10 z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-black/60 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.2fr_400px]"
        >
          {/* Left Hero (Godmode visuals) */}
          <div className="hidden flex-col justify-between p-10 lg:flex relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-champagne/15 champagne-glow">
                <ReceiptText className="h-7 w-7 text-champagne" />
              </div>
              <h1 className="mt-8 text-5xl font-bold tracking-tight text-white">Telos Labs <br/> <span className="text-champagne">Elite Edition</span></h1>
              <p className="mt-4 max-w-md text-sm leading-7 text-text-secondary">
                The CRA-compliant receipt intelligence suite. SHA-256 integrity, semantic search, and enterprise-grade audit controls.
              </p>
            </div>

            <div className="relative z-10 mt-12 w-[150%] -ml-10">
              <Marquee pauseOnHover className="[--duration:30s]">
                <FeatureCard title="Tamper-Evident" desc="SHA-256 Merkle chain history" icon={ShieldCheck} />
                <FeatureCard title="Semantic AI" desc="Context-aware receipt taxonomy" icon={Layers} />
                <FeatureCard title="CRA Compliance" desc="One-click organized export zips" icon={Download} />
              </Marquee>
              <Marquee reverse pauseOnHover className="mt-4 [--duration:35s]">
                <FeatureCard title="Role-Based" desc="Owner / Employee / Accountant" icon={UserCircle2} />
                <FeatureCard title="Fraud Engine" desc="Duplicate and anomaly detection" icon={AlertCircle} />
                <FeatureCard title="Cost Control" desc="Live recoverable tax tracking" icon={TrendingUp} />
              </Marquee>
            </div>
            
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
          </div>

          {/* Right Form */}
          <div className="bg-white/5 p-6 sm:p-10 border-l border-white/5 relative z-10 shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col justify-center">
            <div className="mx-auto w-full max-w-md">
              <div className="mb-8 text-center lg:text-left">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-champagne/15 champagne-glow lg:hidden mb-6">
                  <ReceiptText className="h-8 w-8 text-champagne" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-white">
                  {mode === 'signin' ? 'Welcome back' : 'Create account'}
                </h2>
                <p className="mt-2 text-sm text-text-secondary">
                  {mode === 'signin'
                    ? 'Sign in to access your workspace.'
                    : 'Start capturing and organizing receipts securely.'}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-champagne-dim">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-glass-border bg-black/40 px-4 py-3 text-sm text-white outline-none backdrop-blur-md transition placeholder:text-white/20 focus:border-champagne/40 focus:ring-1 focus:ring-champagne/15"
                    placeholder="you@company.ca"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-champagne-dim">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    className="w-full rounded-2xl border border-glass-border bg-black/40 px-4 py-3 text-sm text-white outline-none backdrop-blur-md transition placeholder:text-white/20 focus:border-champagne/40 focus:ring-1 focus:ring-champagne/15"
                    placeholder="••••••••"
                  />
                </div>

                {mode === 'signup' && (
                  <button
                    type="button"
                    onClick={() => setAccepted((v) => !v)}
                    className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
                      accepted
                        ? 'border-champagne/40 bg-champagne/[0.08]'
                        : 'border-white/10 bg-black/40 hover:border-white/20'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors ${
                        accepted ? 'border-champagne bg-champagne text-black' : 'border-white/30 bg-black/50'
                      }`}
                    >
                      {accepted && <CheckCircle2 className="h-3.5 w-3.5" />}
                    </div>
                    <p className="text-xs leading-5 text-white/60">
                      I accept responsibility for reviewing exported tax and accounting data.
                    </p>
                  </button>
                )}

                <div className="grid gap-3 pt-2">
                  <motion.button
                    type="button"
                    onClick={handleSubmit}
                    whileTap={{ scale: 0.96 }}
                    disabled={loading || passkeyLoading || (!accepted && mode === 'signup')}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#dfcaaa] to-champagne px-4 py-3.5 text-sm font-bold text-black shadow-[0_0_15px_rgba(190,169,142,0.3)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin text-black/50" />}
                    {mode === 'signin' ? 'Sign In' : 'Create Account'}
                  </motion.button>

                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!email) {
                          showToast('error', 'Enter your email first.');
                          return;
                        }
                        try {
                          const { error } = await supabase.auth.resetPasswordForEmail(email);
                          if (error) throw error;
                          showToast('success', 'Password reset email sent. Check your inbox.');
                        } catch (err: unknown) {
                          showToast('error', err instanceof Error ? err.message : 'Failed to send reset email.');
                        }
                      }}
                      className="mt-2 text-xs font-medium text-text-secondary transition hover:text-champagne"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>

                <div className="mt-8 text-center border-t border-white/10 pt-6">
                  <button
                    type="button"
                    onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
                    className="text-xs font-semibold text-text-secondary transition hover:text-champagne lg:text-sm"
                  >
                    {mode === 'signin' ? "Don't have access? Request account" : 'Already authorized? Sign in'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AuroraBackground>
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

function AppContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>(tabParam || 'dashboard');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const setTabWithUrl = useCallback((tab: Tab) => {
    setActiveTab(tab);
    router.push(`?tab=${tab}`, { scroll: false });
  }, [router]);
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
      if (['dashboard', 'export', 'audit', 'reconcile'].includes(activeTab)) {
        setTabWithUrl('scan');
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

  const { data: receipts = [], isLoading: receiptsLoading, refetch: fetchReceipts } = useQuery({
    queryKey: ['receipts', role, userId],
    queryFn: async () => getReceipts(role, userId),
    enabled: !!userId,
  });

  // Parallel Prefetching to kill the 9-second waterfall
  useQuery({
    queryKey: ['business_units'],
    queryFn: getBusinessUnits,
    enabled: !!userId,
  });

  useQuery({
    queryKey: ['audit_logs'],
    queryFn: async () => getAuditLogs(50),
    enabled: !!userId && role !== 'Employee',
  });

  const handleFilterClick = useCallback((filter: string) => {
    setActiveFilter(filter);
    setTabWithUrl('receipts');
  }, [setTabWithUrl]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setRoleOpen(false);
    setTabWithUrl('dashboard');
    setActiveFilter('all');
  };

  const handleCommand = (action: string) => {
    if (action === 'scan') setTabWithUrl('scan');
    if (action === 'bulk-upload') setTabWithUrl('scan'); // Maps to Scanner bulk capabilities
    if (action === 'missing-bn') { setActiveFilter('missing-bn'); setTabWithUrl('receipts'); }
    if (action === 'export-idea') setTabWithUrl('export'); // Export tab handles IDEA
    if (action === 'toggle-role') setRoleOpen(true);
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
    { id: 'reconcile', label: 'Bank', icon: <TrendingUp className="h-5 w-5" /> },
    { id: 'more', label: 'More', icon: <MoreHorizontal className="h-5 w-5" /> },
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
              <h1 className="text-base font-bold tracking-tight text-text-primary">Telos Labs</h1>
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
              <History receipts={receipts} activeFilter={activeFilter} onUpdate={() => { fetchReceipts(); }} role={role} />
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
          ) : activeTab === 'reconcile' ? (
            <motion.div 
              key="reconcile"
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={tabTransition}
            >
              <BankReconciliation receipts={receipts} />
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

        {/* 'More' Bottom Sheet */}
        <AnimatePresence>
          {activeTab === 'more' && (
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-x-0 bottom-0 z-[60] flex flex-col rounded-t-[2.5rem] border-t border-glass-border bg-black/60 p-6 pb-32 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] backdrop-blur-3xl sm:mx-auto sm:max-w-md sm:border-x sm:border-white/10"
            >
              <div className="mx-auto mb-6 h-1 w-12 rounded-full bg-white/20" />
              
              <button 
                onClick={() => setActiveTab('dashboard')}
                className="absolute right-6 top-6 rounded-full bg-white/5 p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>

              <h3 className="mb-4 px-2 text-lg font-bold text-white">More Options</h3>
              
              <div className="grid gap-2">
                {role !== 'Employee' && (
                  <>
                    <button onClick={() => setActiveTab('audit')} className="flex items-center gap-3 rounded-2xl bg-white/5 p-4 transition hover:bg-white/10">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-champagne/15 text-champagne"><ShieldCheck className="h-5 w-5" /></div>
                      <div className="text-left"><p className="text-sm font-bold text-white">Audit Trail</p><p className="text-xs text-white/50">Immutable Merkle history</p></div>
                    </button>
                    <button onClick={() => setActiveTab('export')} className="flex items-center gap-3 rounded-2xl bg-white/5 p-4 transition hover:bg-white/10">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-champagne/15 text-champagne"><Download className="h-5 w-5" /></div>
                      <div className="text-left"><p className="text-sm font-bold text-white">CRA Export</p><p className="text-xs text-white/50">Generate compliance ZIPs</p></div>
                    </button>
                  </>
                )}
                
                <div className="mt-4 px-2">
                  <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">Legal & Settings</p>
                  <Link href="/terms" className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-white/5">
                    <Scale className="h-4 w-4 text-white/50" />
                    <span className="text-sm font-semibold text-white/80">Terms of Service</span>
                  </Link>
                  <Link href="/privacy" className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-white/5">
                    <ShieldCheck className="h-4 w-4 text-white/50" />
                    <span className="text-sm font-semibold text-white/80">Privacy Policy</span>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-50 liquid-glass">
        <div className="mx-auto flex max-w-6xl items-end justify-around px-2 py-2 sm:px-4">
          {navItems.map((item) => {
            /* Employee: hide certain tabs, but 'more' can still hold settings/legal */
            if (role === 'Employee' && ['dashboard', 'export', 'audit', 'reconcile'].includes(item.id)) {
              return null;
            }
            /* Accountant: grant access to audit (was incorrectly hidden) */
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
              <motion.button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className={`flex min-w-[64px] flex-col items-center gap-1 rounded-2xl px-3 py-2 transition ${
                  activeTab === item.id ? 'text-champagne' : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                  {item.label}
                </span>
              </motion.button>
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

      <CommandPalette onAction={handleCommand} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <AppContent />
    </Suspense>
  );
}