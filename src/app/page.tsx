'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { supabase } from '@/lib/supabase';
import { scanReceipt } from './actions/scan-receipt';
import {
  LayoutDashboard,
  Receipt,
  Camera,
  Download,
  ShieldCheck,
  DollarSign,
  Hash,
  TrendingUp,
  ChevronRight,
  ArrowLeft,
  Loader2,
  RefreshCw,
  LogOut,
  FileArchive,
  FileText,
  ScanLine,
  Building2,
  CalendarDays,
  Tag,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Info,
  Wallet,
  Receipt as ReceiptIcon,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Receipt {
  id: string;
  user_id: string;
  vendor_name: string;
  total_amount: number;
  tax_amount: number;
  vendor_tax_number: string;
  transaction_date: string;
  category: string;
  notes: string;
  payment_method: string;
  currency: string;
  image_url?: string;
  created_at?: string;
}

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  details: string;
  created_at: string;
}

type Tab = 'dashboard' | 'receipts' | 'scan' | 'export' | 'audit';

const CATEGORIES = [
  'Office Supplies',
  'Meals & Entertainment',
  'Travel',
  'Fuel',
  'Professional Fees',
  'Supplies',
  'General Expense',
] as const;

const PAYMENT_METHODS = ['Visa', 'Mastercard', 'Amex', 'Debit', 'Cash', 'E-Transfer', 'Cheque'] as const;

// ── Utilities ──────────────────────────────────────────────────────────────────
const todayISO = () => new Date().toISOString().split('T')[0];

const fmt$ = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);

const fmtDate = (s?: string) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
};

const fmtMonth = (s: string) => {
  const [y, m] = s.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-CA', { month: 'short', year: '2-digit' });
};

const resizeImage = (base64: string): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > 2000) { height = (height * 2000) / width; width = 2000; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = base64;
  });

const base64ToBlob = (b64: string): Blob => {
  const raw = b64.replace(/^data:image\/\w+;base64,/, '');
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: 'image/jpeg' });
};

const escapeCSV = (v: unknown) =>
  v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;

const buildCSV = (receipts: Receipt[]): string => {
  const BOM = '\uFEFF';
  const headers = ['Date', 'Vendor', 'Category', 'Payment Method', 'Currency', 'Total', 'GST/HST', 'Business Number', 'Business Purpose', 'Image URL']
    .map(escapeCSV).join(',');
  const rows = receipts.map((r) =>
    [
      fmtDate(r.transaction_date), r.vendor_name, r.category,
      r.payment_method, r.currency,
      r.total_amount.toFixed(2), r.tax_amount.toFixed(2),
      r.vendor_tax_number, r.notes, r.image_url,
    ].map(escapeCSV).join(',')
  ).join('\n');
  return BOM + headers + '\n' + rows;
};

// ── Category colour map ────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  'Office Supplies':     '#3b82f6',
  'Meals & Entertainment': '#f59e0b',
  'Travel':              '#8b5cf6',
  'Fuel':                '#ef4444',
  'Professional Fees':   '#10b981',
  'Supplies':            '#06b6d4',
  'General Expense':     '#6b7280',
};

// ── Root component ─────────────────────────────────────────────────────────────
export default function ReceiptPro() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_: any, session: any) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) return <FullPageLoader />;
  if (!user) return <AuthScreen />;

  return <AppShell user={user} fileInputRef={fileInputRef} />;
}

// ── Full page loader ───────────────────────────────────────────────────────────
function FullPageLoader() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg">
          <ReceiptIcon className="w-8 h-8 text-white" />
        </div>
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    </div>
  );
}

// ── Auth Screen ────────────────────────────────────────────────────────────────
function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = async () => {
    if (!email || !password) return showToast('error', 'Please fill in all fields.');
    setLoading(true);
    const fn = mode === 'signin'
      ? () => supabase.auth.signInWithPassword({ email, password })
      : () => supabase.auth.signUp({ email, password });
    const { error } = await fn();
    if (error) showToast('error', error.message);
    else if (mode === 'signup') showToast('success', 'Check your email to confirm your account.');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {toast.msg}
        </div>
      )}

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-blue-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/40 mx-auto mb-5">
            <ReceiptIcon className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Receipt Pro</h1>
          <p className="text-blue-300 text-sm mt-1 font-medium uppercase tracking-widest">CRA Audit Ready</p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
          <h2 className="text-white font-semibold text-lg mb-6 text-center">
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-blue-200 text-xs font-semibold uppercase tracking-wider mb-2 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="you@company.ca"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400 focus:bg-white/15 transition-all text-sm"
              />
            </div>
            <div>
              <label className="text-blue-200 text-xs font-semibold uppercase tracking-wider mb-2 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="••••••••"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400 focus:bg-white/15 transition-all text-sm"
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-60 text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </div>
          <button
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="w-full text-center text-blue-300 hover:text-white text-sm mt-5 transition-colors"
          >
            {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── App Shell ──────────────────────────────────────────────────────────────────
function AppShell({ user, fileInputRef }: { user: any; fileInputRef: React.RefObject<HTMLInputElement | null> }) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);

  // Scan state
  const [image, setImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [formData, setFormData] = useState({
    vendor_name: '', total_amount: 0, tax_amount: 0, vendor_tax_number: '',
    transaction_date: todayISO(), category: 'General Expense', notes: '',
    payment_method: 'Visa', currency: 'CAD',
  });
  const [saving, setSaving] = useState(false);

  const showToast = useCallback((type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('receipts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setReceipts(data || []);
    } catch (e: any) {
      showToast('error', 'Failed to load receipts.');
    }
    setLoading(false);
  }, [user.id, showToast]);

  const loadAudit = useCallback(async () => {
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setAuditLogs(data || []);
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (activeTab === 'audit') loadAudit(); }, [activeTab, loadAudit]);

  // ── Scan handlers ────────────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.readAsDataURL(file);
    });
    const resized = await resizeImage(base64);
    setImage(resized);
    setActiveTab('scan');
    // Reset form
    setFormData({ vendor_name: '', total_amount: 0, tax_amount: 0, vendor_tax_number: '', transaction_date: todayISO(), category: 'General Expense', notes: '', payment_method: 'Visa', currency: 'CAD' });
    if (e.target) e.target.value = '';
  };

  const processReceipt = async () => {
    if (!image) return;
    setScanning(true);
    try {
      const result = await scanReceipt(image);
      if (result.success) {
        setFormData((prev) => ({ ...prev, ...result.data }));
        showToast('success', 'Receipt analyzed successfully!');
      } else {
        showToast('error', result.error);
      }
    } catch (e: any) {
      showToast('error', e.message || 'Scan failed.');
    }
    setScanning(false);
  };

  const saveReceipt = async () => {
    if (!image || !user) return;
    setSaving(true);
    try {
      const blob = base64ToBlob(image);
      const filePath = `${user.id}/${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('receipt-images')
        .upload(filePath, blob, { contentType: 'image/jpeg', upsert: false });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from('receipt-images').getPublicUrl(filePath);

      await supabase.from('receipts').insert({
        user_id: user.id,
        ...formData,
        total_amount: Number(formData.total_amount),
        tax_amount: Number(formData.tax_amount),
        image_url: publicUrl,
      });

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'receipt_created',
        details: `Added: ${formData.vendor_name} ${fmt$(Number(formData.total_amount))} — ${formData.category}`,
      });

      setImage(null);
      setFormData({ vendor_name: '', total_amount: 0, tax_amount: 0, vendor_tax_number: '', transaction_date: todayISO(), category: 'General Expense', notes: '', payment_method: 'Visa', currency: 'CAD' });
      await loadData();
      setActiveTab('receipts');
      showToast('success', 'Receipt saved to audit record!');
    } catch (e: any) {
      showToast('error', `Save failed: ${e.message}`);
    }
    setSaving(false);
  };

  // ── Export ───────────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const csv = buildCSV(receipts);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `receipt-pro-${todayISO()}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'CSV exported successfully!');
  };

  const exportZIP = async () => {
    showToast('info', 'Preparing ZIP — this may take a moment…');
    const zip = new JSZip();
    zip.file('receipts.csv', buildCSV(receipts));
    const imgFolder = zip.folder('images')!;
    await Promise.allSettled(
      receipts.filter((r) => r.image_url).map(async (r) => {
        const res = await fetch(r.image_url!);
        const blob = await res.blob();
        const name = `${r.transaction_date}_${r.vendor_name.replace(/[^a-zA-Z0-9]/g, '_')}_${r.id.slice(0, 8)}.jpg`;
        imgFolder.file(name, blob);
      })
    );
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url; a.download = `receipt-pro-${todayISO()}.zip`; a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'ZIP exported!');
  };

  // ── Dashboard Stats ──────────────────────────────────────────────────────────
  const stats = receipts.reduce(
    (acc, r) => ({
      total: acc.total + r.total_amount,
      tax: acc.tax + r.tax_amount,
      count: acc.count + 1,
    }),
    { total: 0, tax: 0, count: 0 }
  );
  const avg = stats.count ? stats.total / stats.count : 0;

  const categoryData = Object.entries(
    receipts.reduce((acc: Record<string, number>, r) => {
      acc[r.category] = (acc[r.category] || 0) + r.total_amount;
      return acc;
    }, {})
  )
    .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);

  const monthlyData = Object.entries(
    receipts.reduce((acc: Record<string, number>, r) => {
      const month = r.transaction_date?.slice(0, 7) || '';
      if (month) acc[month] = (acc[month] || 0) + r.total_amount;
      return acc;
    }, {})
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 }));

  // ── Nav tabs config ──────────────────────────────────────────────────────────
  const navTabs: { id: Tab; icon: React.ReactNode; label: string; center?: boolean }[] = [
    { id: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { id: 'receipts',  icon: <Receipt size={20} />,         label: 'Receipts' },
    { id: 'scan',      icon: <Camera size={22} />,          label: 'Scan', center: true },
    { id: 'export',    icon: <Download size={20} />,        label: 'Export' },
    { id: 'audit',     icon: <ShieldCheck size={20} />,     label: 'Audit' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-medium max-w-xs w-full animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'error' ? 'bg-red-500 text-white' :
          toast.type === 'info'  ? 'bg-blue-500 text-white' :
                                   'bg-emerald-500 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle size={16} /> : toast.type === 'info' ? <Info size={16} /> : <CheckCircle2 size={16} />}
          <span className="flex-1">{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/60 shadow-sm">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-md">
              <ReceiptIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-none">Receipt Pro</h1>
              <p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest mt-0.5">CRA Audit Ready · Alberta</p>
            </div>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors py-1.5 px-3 rounded-lg hover:bg-red-50"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 pt-6 pb-28">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
            <p className="text-slate-400 text-sm font-medium">Loading your dashboard…</p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardTab
                stats={{ ...stats, avg }}
                categoryData={categoryData}
                monthlyData={monthlyData}
              />
            )}
            {activeTab === 'receipts' && (
              <ReceiptsTab receipts={receipts} onSelect={setSelectedReceipt} onRefresh={loadData} />
            )}
            {activeTab === 'scan' && (
              <ScanTab
                image={image}
                scanning={scanning}
                formData={formData}
                saving={saving}
                onFile={handleFile}
                onProcess={processReceipt}
                onSave={saveReceipt}
                onChange={setFormData}
                fileRef={fileInputRef}
                onClear={() => setImage(null)}
              />
            )}
            {activeTab === 'export' && (
              <ExportTab receipts={receipts} onCSV={exportCSV} onZIP={exportZIP} />
            )}
            {activeTab === 'audit' && (
              <AuditTab logs={auditLogs} onRefresh={loadAudit} />
            )}
          </>
        )}
      </main>

      {/* Detail overlay */}
      {selectedReceipt && (
        <DetailView receipt={selectedReceipt} onClose={() => setSelectedReceipt(null)} />
      )}

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200/60 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
        <div className="max-w-2xl mx-auto px-2 py-2 flex items-center justify-around">
          {navTabs.map((tab) =>
            tab.center ? (
              <button
                key={tab.id}
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-1 -mt-6"
              >
                <div className="w-14 h-14 bg-blue-500 hover:bg-blue-600 active:scale-95 rounded-full flex items-center justify-center shadow-xl shadow-blue-500/40 transition-all">
                  <Camera className="w-6 h-6 text-white" />
                </div>
                <span className="text-[10px] font-semibold text-blue-500">Scan</span>
              </button>
            ) : (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
                  activeTab === tab.id ? 'text-blue-500' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {tab.icon}
                <span className={`text-[10px] font-semibold ${activeTab === tab.id ? 'text-blue-500' : ''}`}>
                  {tab.label}
                </span>
                {activeTab === tab.id && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full bg-blue-500" />
                )}
              </button>
            )
          )}
        </div>
      </nav>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

// ── Dashboard Tab ──────────────────────────────────────────────────────────────
function DashboardTab({ stats, categoryData, monthlyData }: {
  stats: { total: number; tax: number; count: number; avg: number };
  categoryData: { name: string; amount: number }[];
  monthlyData: { month: string; amount: number }[];
}) {
  const statCards = [
    { label: 'Total Spend',   value: fmt$(stats.total), icon: <Wallet size={18} className="text-blue-500" />,   bg: 'bg-blue-50',   ring: 'ring-blue-100' },
    { label: 'GST/HST Paid',  value: fmt$(stats.tax),   icon: <DollarSign size={18} className="text-emerald-500" />, bg: 'bg-emerald-50', ring: 'ring-emerald-100' },
    { label: 'Receipts',      value: stats.count.toString(), icon: <Hash size={18} className="text-violet-500" />, bg: 'bg-violet-50', ring: 'ring-violet-100' },
    { label: 'Avg Receipt',   value: fmt$(stats.avg),   icon: <TrendingUp size={18} className="text-amber-500" />, bg: 'bg-amber-50',  ring: 'ring-amber-100' },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-xl text-sm">
        <p className="text-slate-500 text-xs mb-1">{label}</p>
        <p className="font-bold text-slate-900">{fmt$(payload[0].value)}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        {statCards.map((c) => (
          <div key={c.label} className={`bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-shadow ring-1 ${c.ring}`}>
            <div className={`w-9 h-9 ${c.bg} rounded-xl flex items-center justify-center mb-3`}>{c.icon}</div>
            <p className="text-xl font-bold text-slate-900 leading-tight">{c.value}</p>
            <p className="text-xs text-slate-400 font-medium mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      {categoryData.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Spending by Category</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={categoryData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                tickFormatter={(v) => v.length > 8 ? v.slice(0, 8) + '…' : v} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                tickFormatter={(v) => `$${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="amount" radius={[6, 6, 0, 0]}
                fill="#3b82f6"
                label={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Line chart */}
      {monthlyData.length > 1 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Monthly Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                tickFormatter={fmtMonth} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                tickFormatter={(v) => `$${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2.5}
                dot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {categoryData.length === 0 && (
        <div className="bg-white rounded-2xl p-10 border border-slate-100 text-center">
          <ReceiptIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Scan your first receipt to see insights</p>
        </div>
      )}
    </div>
  );
}

// ── Receipts Tab ───────────────────────────────────────────────────────────────
function ReceiptsTab({ receipts, onSelect, onRefresh }: {
  receipts: Receipt[];
  onSelect: (r: Receipt) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Receipts</h2>
          <p className="text-xs text-slate-400 mt-0.5">{receipts.length} record{receipts.length !== 1 ? 's' : ''} · newest first</p>
        </div>
        <button onClick={onRefresh} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-blue-500 transition-all">
          <RefreshCw size={18} />
        </button>
      </div>

      {receipts.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-100 text-center">
          <Receipt className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No receipts yet — tap Scan to add one</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {receipts.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelect(r)}
              className="w-full bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100 active:scale-[0.99] transition-all text-left"
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: CATEGORY_COLORS[r.category] || '#6b7280' }}
                >
                  {r.vendor_name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate text-sm">{r.vendor_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400">{fmtDate(r.transaction_date)}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-200" />
                    <span className="text-xs text-slate-400 truncate">{r.category}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="font-bold text-blue-600 text-sm">{fmt$(r.total_amount)}</span>
                  <ChevronRight size={14} className="text-slate-300" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Scan Tab ───────────────────────────────────────────────────────────────────
function ScanTab({ image, scanning, formData, saving, onFile, onProcess, onSave, onChange, fileRef, onClear }: {
  image: string | null;
  scanning: boolean;
  formData: any;
  saving: boolean;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onProcess: () => void;
  onSave: () => void;
  onChange: (d: any) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onClear: () => void;
}) {
  const hasData = formData.vendor_name || formData.total_amount > 0;

  return (
    <div className="space-y-4">
      {/* Image preview / capture zone */}
      <div
        className={`relative overflow-hidden rounded-2xl border-2 transition-all ${
          image ? 'border-blue-200 bg-slate-100' : 'border-dashed border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/30'
        }`}
        style={{ aspectRatio: '4/3' }}
      >
        {!image ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full h-full flex flex-col items-center justify-center gap-3 transition-colors"
          >
            <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100">
              <Camera className="w-10 h-10 text-blue-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-600">Tap to Scan Receipt</p>
              <p className="text-xs text-slate-400 mt-1">Opens native high-res camera</p>
            </div>
          </button>
        ) : (
          <>
            <img src={image} alt="Receipt" className="w-full h-full object-contain" />
            <button
              onClick={onClear}
              className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </>
        )}
      </div>

      {/* AI scan button */}
      {image && !scanning && !hasData && (
        <button
          onClick={onProcess}
          className="w-full bg-blue-500 hover:bg-blue-600 active:scale-[0.99] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-blue-500/25 transition-all"
        >
          <ScanLine size={20} />
          Analyze with Gemini AI
        </button>
      )}

      {/* Scanning loader */}
      {scanning && (
        <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">Extracting receipt data…</p>
          <p className="text-xs text-slate-400 mt-1">CRA-compliant field detection in progress</p>
        </div>
      )}

      {/* Review form */}
      {hasData && !scanning && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Review & Confirm</h3>
              <p className="text-xs text-slate-400 mt-0.5">Verify AI extraction before saving</p>
            </div>
            <button onClick={onProcess} className="text-xs text-blue-500 hover:text-blue-700 font-semibold flex items-center gap-1">
              <ScanLine size={12} /> Re-analyze
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Vendor */}
            <Field label="Vendor Name" icon={<Building2 size={14} className="text-slate-400" />}>
              <input
                type="text" value={formData.vendor_name}
                onChange={(e) => onChange({ ...formData, vendor_name: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </Field>

            {/* Amounts */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Total (CAD)" icon={<DollarSign size={14} className="text-slate-400" />}>
                <input
                  type="number" step="0.01" min="0" value={formData.total_amount}
                  onChange={(e) => onChange({ ...formData, total_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </Field>
              <Field label="GST (5%)" icon={<DollarSign size={14} className="text-slate-400" />}>
                <input
                  type="number" step="0.01" min="0" value={formData.tax_amount}
                  onChange={(e) => onChange({ ...formData, tax_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </Field>
            </div>

            {/* Date & Category */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" icon={<CalendarDays size={14} className="text-slate-400" />}>
                <input
                  type="date" value={formData.transaction_date}
                  onChange={(e) => onChange({ ...formData, transaction_date: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </Field>
              <Field label="Category" icon={<Tag size={14} className="text-slate-400" />}>
                <select
                  value={formData.category}
                  onChange={(e) => onChange({ ...formData, category: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-white"
                >
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
            </div>

            {/* Payment & BN */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Payment Method" icon={<CreditCard size={14} className="text-slate-400" />}>
                <select
                  value={formData.payment_method}
                  onChange={(e) => onChange({ ...formData, payment_method: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-white"
                >
                  {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Business Number" icon={<Building2 size={14} className="text-slate-400" />}>
                <input
                  type="text" value={formData.vendor_tax_number} placeholder="123456789RT0001"
                  onChange={(e) => onChange({ ...formData, vendor_tax_number: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </Field>
            </div>

            {/* Business purpose */}
            <Field label="Business Purpose (CRA Notes)" icon={<FileText size={14} className="text-slate-400" />}>
              <textarea
                rows={2} value={formData.notes}
                onChange={(e) => onChange({ ...formData, notes: e.target.value })}
                placeholder="e.g. Fuel for company delivery vehicle"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
              />
            </Field>

            {/* Save button */}
            <button
              onClick={onSave}
              disabled={saving}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 active:scale-[0.99] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/25 transition-all mt-2"
            >
              {saving ? <Loader2 className="animate-spin w-5 h-5" /> : <ShieldCheck size={20} />}
              {saving ? 'Saving to Audit Record…' : 'Save Audit Record'}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!image && (
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <div className="flex gap-3">
            <Info size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700 leading-relaxed">
              Tap the camera above to open your native camera app. High-resolution images are automatically compressed for fast AI processing. All receipts are stored CRA-audit-ready with GST/HST breakdown.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Small form field wrapper
function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        {icon}{label}
      </label>
      {children}
    </div>
  );
}

// ── Export Tab ─────────────────────────────────────────────────────────────────
function ExportTab({ receipts, onCSV, onZIP }: { receipts: Receipt[]; onCSV: () => void; onZIP: () => void }) {
  const totalImages = receipts.filter((r) => r.image_url).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Export</h2>
        <p className="text-xs text-slate-400 mt-0.5">{receipts.length} records ready to export</p>
      </div>

      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-6 text-white shadow-xl shadow-blue-500/25">
        <Download className="w-10 h-10 mb-3 opacity-80" />
        <h3 className="font-bold text-lg">CRA Export Package</h3>
        <p className="text-blue-100 text-sm mt-1">Complete audit trail for Canadian tax filing</p>
        <div className="grid grid-cols-3 gap-3 mt-5 text-center">
          {[
            { label: 'Receipts', value: receipts.length },
            { label: 'With Images', value: totalImages },
            { label: 'Total GST', value: fmt$(receipts.reduce((a, r) => a + r.tax_amount, 0)) },
          ].map((s) => (
            <div key={s.label} className="bg-white/10 rounded-xl p-2.5">
              <p className="font-bold text-lg leading-none">{s.value}</p>
              <p className="text-[10px] text-blue-200 mt-1 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={onCSV}
          disabled={receipts.length === 0}
          className="w-full bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-200 hover:border-blue-200 rounded-2xl p-4 text-left flex items-center gap-4 shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
        >
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100 flex-shrink-0">
            <FileText className="w-6 h-6 text-emerald-500" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-slate-900">Export CSV</p>
            <p className="text-xs text-slate-400 mt-0.5">UTF-8 BOM · Excel compatible · All {receipts.length} records</p>
          </div>
          <ChevronRight size={16} className="text-slate-300" />
        </button>

        <button
          onClick={onZIP}
          disabled={receipts.length === 0}
          className="w-full bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-200 hover:border-indigo-200 rounded-2xl p-4 text-left flex items-center gap-4 shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
        >
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100 flex-shrink-0">
            <FileArchive className="w-6 h-6 text-indigo-500" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-slate-900">Export ZIP</p>
            <p className="text-xs text-slate-400 mt-0.5">CSV + {totalImages} receipt image{totalImages !== 1 ? 's' : ''} · Full audit package</p>
          </div>
          <ChevronRight size={16} className="text-slate-300" />
        </button>
      </div>

      <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
        <div className="flex gap-3">
          <ShieldCheck size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700 leading-relaxed">
            <strong>CRA Tip:</strong> Keep records for a minimum of 6 years. The ZIP export includes original receipt images required for GST/HST input tax credit claims.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Audit Tab ──────────────────────────────────────────────────────────────────
function AuditTab({ logs, onRefresh }: { logs: AuditLog[]; onRefresh: () => void }) {
  const actionLabels: Record<string, { label: string; color: string }> = {
    receipt_created: { label: 'Created',  color: 'bg-emerald-100 text-emerald-700' },
    receipt_deleted: { label: 'Deleted',  color: 'bg-red-100 text-red-700' },
    receipt_updated: { label: 'Updated',  color: 'bg-blue-100 text-blue-700' },
    export_csv:      { label: 'Exported', color: 'bg-violet-100 text-violet-700' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Audit Log</h2>
          <p className="text-xs text-slate-400 mt-0.5">{logs.length} event{logs.length !== 1 ? 's' : ''} recorded</p>
        </div>
        <button onClick={onRefresh} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-blue-500 transition-all">
          <RefreshCw size={18} />
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-100 text-center">
          <ShieldCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No audit events yet</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {logs.map((log) => {
            const meta = actionLabels[log.action] || { label: log.action, color: 'bg-slate-100 text-slate-600' };
            return (
              <div key={log.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900">{log.details}</p>
                    <p className="text-xs text-slate-400 mt-1.5 font-mono">
                      {new Date(log.created_at).toLocaleString('en-CA', {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full flex-shrink-0 ${meta.color}`}>
                    {meta.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Detail View ────────────────────────────────────────────────────────────────
function DetailView({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const rows = [
    { label: 'Date',           value: fmtDate(receipt.transaction_date), icon: <CalendarDays size={14} /> },
    { label: 'Category',       value: receipt.category,                  icon: <Tag size={14} /> },
    { label: 'Total',          value: fmt$(receipt.total_amount),         icon: <DollarSign size={14} /> },
    { label: 'GST/HST (5%)',   value: fmt$(receipt.tax_amount),           icon: <DollarSign size={14} /> },
    { label: 'Payment',        value: receipt.payment_method,             icon: <CreditCard size={14} /> },
    { label: 'Currency',       value: receipt.currency,                   icon: <Wallet size={14} /> },
    { label: 'Business #',     value: receipt.vendor_tax_number || '—',   icon: <Building2 size={14} /> },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-900 truncate">{receipt.vendor_name}</h2>
            <p className="text-xs text-slate-400">{fmtDate(receipt.transaction_date)}</p>
          </div>
          <span className="font-bold text-blue-600">{fmt$(receipt.total_amount)}</span>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          {/* Image */}
          {receipt.image_url && (
            <div className="bg-slate-50 border-b border-slate-100">
              <img
                src={receipt.image_url}
                alt="Receipt"
                className="w-full max-h-72 object-contain"
              />
            </div>
          )}

          {/* Fields */}
          <div className="p-5 space-y-1">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-2 text-slate-400">
                  {r.icon}
                  <span className="text-xs font-semibold uppercase tracking-wide">{r.label}</span>
                </div>
                <span className="text-sm font-semibold text-slate-900 text-right max-w-[55%] break-words">{r.value}</span>
              </div>
            ))}
          </div>

          {/* Business purpose */}
          {receipt.notes && (
            <div className="mx-5 mb-5 bg-blue-50 rounded-2xl p-4 border border-blue-100">
              <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1.5">Business Purpose</p>
              <p className="text-sm text-blue-900">{receipt.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}