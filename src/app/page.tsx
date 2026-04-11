'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { supabase } from '@/lib/supabase';
import { scanReceipt } from './actions/scan-receipt';
import type { ScannedReceiptData } from './actions/scan-receipt';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  FileArchive,
  FileText,
  Fingerprint,
  Hash,
  Info,
  Layers,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  PackageCheck,
  Receipt,
  RefreshCw,
  ScanLine,
  Search,
  ShieldCheck,
  Tag,
  Thermometer,
  TrendingUp,
  Truck,
  UserCircle2,
  Wallet,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  LineChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const APP_VERSION = '3.0.0-CA-P1';

type Tab = 'dashboard' | 'receipts' | 'scan' | 'export' | 'audit';
type Role = 'Owner' | 'Employee';

interface ReceiptRow {
  id: string;
  user_id: string;
  business_unit_id?: string | null;
  vendor_name: string;
  vendor_address?: string | null;
  vendor_tax_number?: string | null;
  total_amount: number;
  subtotal?: number | null;
  tax_amount: number;
  pst_amount?: number | null;
  transaction_date: string;
  transaction_time?: string | null;
  payment_method: string;
  card_last_four?: string | null;
  category: string;
  notes: string;
  currency: string;
  image_url?: string | null;
  integrity_hash?: string | null;
  confidence_score?: number | null;
  cra_readiness_score?: number | null;
  thermal_warning?: boolean | null;
  capture_source?: string | null;
  device_info?: string | null;
  usage_type?: 'business' | 'personal' | 'mixed' | null;
  business_use_percent?: number | null;
  job_code?: string | null;
  vehicle_id?: string | null;
  created_at?: string | null;
}

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  details: string;
  created_at: string;
}

interface BusinessUnit {
  id: string;
  name: string;
}

const CATEGORIES = [
  'Office Supplies',
  'Meals & Entertainment',
  'Travel',
  'Fuel',
  'Professional Fees',
  'Supplies',
  'Software & Subscriptions',
  'Utilities',
  'General Expense',
] as const;

const PAYMENT_METHODS = ['Visa', 'Mastercard', 'Amex', 'Debit', 'Cash', 'E-Transfer', 'Cheque', 'Unknown'] as const;
const USAGE_TYPES = ['business', 'personal', 'mixed'] as const;

const CATEGORY_COLORS: Record<string, string> = {
  'Office Supplies': '#3b82f6',
  'Meals & Entertainment': '#f59e0b',
  Travel: '#8b5cf6',
  Fuel: '#ef4444',
  'Professional Fees': '#10b981',
  Supplies: '#06b6d4',
  'Software & Subscriptions': '#ec4899',
  Utilities: '#f97316',
  'General Expense': '#6b7280',
};

type ScanForm = {
  vendor_name: string;
  vendor_address: string;
  vendor_tax_number: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  pst_amount: number;
  transaction_date: string;
  transaction_time: string;
  payment_method: string;
  card_last_four: string;
  category: string;
  notes: string;
  currency: string;
  confidence_score: number;
  cra_readiness_score: number;
  thermal_warning: boolean;
  document_type: 'receipt' | 'invoice' | 'statement' | 'unknown';
  duplicate_warning: boolean;
  math_mismatch_warning: boolean;
  missing_bn_warning: boolean;
  capture_source: 'camera' | 'upload';
  device_info: string;
  usage_type: 'business' | 'personal' | 'mixed';
  business_use_percent: number;
  job_code: string;
  vehicle_id: string;
  business_unit_id: string;
};

const todayISO = () => new Date().toISOString().split('T')[0];

const BLANK_FORM: ScanForm = {
  vendor_name: '',
  vendor_address: '',
  vendor_tax_number: '',
  total_amount: 0,
  subtotal: 0,
  tax_amount: 0,
  pst_amount: 0,
  transaction_date: todayISO(),
  transaction_time: '',
  payment_method: 'Unknown',
  card_last_four: '',
  category: 'General Expense',
  notes: '',
  currency: 'CAD',
  confidence_score: 0,
  cra_readiness_score: 0,
  thermal_warning: false,
  document_type: 'unknown',
  duplicate_warning: false,
  math_mismatch_warning: false,
  missing_bn_warning: false,
  capture_source: 'camera',
  device_info: '',
  usage_type: 'business',
  business_use_percent: 100,
  job_code: '',
  vehicle_id: '',
  business_unit_id: '',
};

const inputCls =
  'w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all bg-white';

const warningInputCls =
  'w-full rounded-xl border border-yellow-400 bg-yellow-50/70 px-3 py-2.5 text-sm text-slate-900 placeholder:text-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-100 focus:border-yellow-500 transition-all';

const fmt$ = (n: number) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(Number.isFinite(n) ? n : 0);

const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const fmtMonth = (s: string) => {
  const [y, m] = s.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-CA', {
    month: 'short',
    year: '2-digit',
  });
};

const escapeCSV = (v: unknown) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`);

async function resizeImageTo2000(base64: string): Promise<string> {
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const longest = Math.max(width, height);

      if (longest > 2000) {
        const scale = 2000 / longest;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = base64;
  });
}

function base64ToBlob(b64: string): Blob {
  const raw = b64.replace(/^data:image\/\w+;base64,/, '');
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: 'image/jpeg' });
}

async function computeSHA256(base64: string): Promise<string> {
  const raw = base64.replace(/^data:image\/\w+;base64,/, '');
  const binaryStr = atob(raw);
  const bytes = new Uint8Array(binaryStr.length);

  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes.buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getConfidenceTone(score?: number | null) {
  const s = Number(score ?? 0);
  if (s >= 85) {
    return {
      label: 'High',
      pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      panel: 'bg-emerald-50 border-emerald-100 text-emerald-800',
      icon: 'text-emerald-500',
    };
  }
  if (s >= 60) {
    return {
      label: 'Medium',
      pill: 'bg-amber-50 text-amber-700 border-amber-200',
      panel: 'bg-amber-50 border-amber-100 text-amber-800',
      icon: 'text-amber-500',
    };
  }
  return {
    label: 'Low',
    pill: 'bg-red-50 text-red-700 border-red-200',
    panel: 'bg-red-50 border-red-100 text-red-800',
    icon: 'text-red-500',
  };
}

function getReadinessTone(score?: number | null) {
  const s = Number(score ?? 0);
  if (s >= 85) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s >= 60) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

function buildReceiptsCSV(receipts: ReceiptRow[]): string {
  const BOM = '\uFEFF';
  const headers = [
    'Receipt ID',
    'Business Unit ID',
    'Vendor',
    'Vendor Address',
    'Business Number',
    'Date',
    'Time',
    'Category',
    'Usage Type',
    'Business Use %',
    'Job Code',
    'Vehicle ID',
    'Payment Method',
    'Card Last 4',
    'Currency',
    'Subtotal',
    'GST',
    'PST',
    'Total',
    'CRA Readiness Score',
    'AI Confidence Score',
    'Thermal Warning',
    'Capture Source',
    'Device Info',
    'Notes',
    'SHA-256 Hash',
    'Image URL',
    'Created At',
  ]
    .map(escapeCSV)
    .join(',');

  const rows = receipts
    .map((r) =>
      [
        r.id,
        r.business_unit_id ?? '',
        r.vendor_name,
        r.vendor_address ?? '',
        r.vendor_tax_number ?? '',
        r.transaction_date,
        r.transaction_time ?? '',
        r.category,
        r.usage_type ?? '',
        r.business_use_percent ?? '',
        r.job_code ?? '',
        r.vehicle_id ?? '',
        r.payment_method,
        r.card_last_four ?? '',
        r.currency,
        Number(r.subtotal ?? 0).toFixed(2),
        Number(r.tax_amount ?? 0).toFixed(2),
        Number(r.pst_amount ?? 0).toFixed(2),
        Number(r.total_amount ?? 0).toFixed(2),
        String(r.cra_readiness_score ?? 0),
        String(r.confidence_score ?? 0),
        r.thermal_warning ? 'YES' : 'NO',
        r.capture_source ?? '',
        r.device_info ?? '',
        r.notes,
        r.integrity_hash ?? '',
        r.image_url ?? '',
        r.created_at ?? '',
      ]
        .map(escapeCSV)
        .join(','),
    )
    .join('\n');

  return `${BOM}${headers}\n${rows}`;
}

function buildLogbookCSV(receipts: ReceiptRow[], operatorEmail: string): string {
  const BOM = '\uFEFF';
  const headers = [
    'Image Filename',
    'Scan Date (UTC)',
    'Vendor',
    'Operator Email',
    'App Version',
    'SHA-256 Integrity Hash',
    'Capture Source',
    'CRA Readiness Score',
    'CRA Standard',
  ]
    .map(escapeCSV)
    .join(',');

  const rows = receipts
    .filter((r) => r.image_url || r.integrity_hash)
    .map((r) => {
      const filename = r.image_url
        ? `${r.transaction_date}_${r.vendor_name.replace(/[^a-zA-Z0-9]/g, '_')}_${r.id.slice(0, 8)}.jpg`
        : '(no image)';
      return [
        filename,
        r.created_at ? new Date(r.created_at).toISOString() : '',
        r.vendor_name,
        operatorEmail,
        APP_VERSION,
        r.integrity_hash ?? '',
        r.capture_source ?? '',
        r.cra_readiness_score ?? 0,
        'IC05-1R1',
      ]
        .map(escapeCSV)
        .join(',');
    })
    .join('\n');

  return `${BOM}${headers}\n${rows}`;
}

export default function ReceiptProPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_: any, session: any) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) return <FullPageLoader />;
  if (!user) return <AuthScreen />;

  return <AppShell user={user} fileInputRef={fileInputRef} />;
}

function FullPageLoader() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-500 flex items-center justify-center shadow-lg">
          <Receipt className="w-8 h-8 text-white" />
        </div>
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    </div>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 4200);
  };

  const submit = async () => {
    if (!email || !password) return showToast('error', 'Please enter your email and password.');
    if (!consentChecked) return showToast('error', 'You must accept the terms before continuing.');

    setLoading(true);

    const fn =
      mode === 'signin'
        ? () => supabase.auth.signInWithPassword({ email, password })
        : () => supabase.auth.signUp({ email, password });

    const { error } = await fn();

    if (error) {
      showToast('error', error.message);
    } else if (mode === 'signup') {
      showToast('success', 'Account created. Check your email to confirm your account.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-medium max-w-sm w-[calc(100%-2rem)] ${
            toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'
          }`}
        >
          {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{toast.msg}</span>
        </div>
      )}

      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-blue-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/30 mx-auto mb-5">
            <Receipt className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Receipt Pro</h1>
          <p className="text-blue-300 text-sm mt-1 font-medium uppercase tracking-widest">Canadian Receipt Intelligence</p>
        </div>

        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
          <h2 className="text-white font-semibold text-lg mb-6 text-center">
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block mb-2 text-xs font-semibold uppercase tracking-wider text-blue-200">Email</label>
              <input
                type="email"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400 focus:bg-white/15 transition-all text-sm"
                placeholder="you@company.ca"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </div>

            <div>
              <label className="block mb-2 text-xs font-semibold uppercase tracking-wider text-blue-200">Password</label>
              <input
                type="password"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400 focus:bg-white/15 transition-all text-sm"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </div>

            <button
              type="button"
              onClick={() => setConsentChecked((v) => !v)}
              className={`w-full text-left flex items-start gap-3 rounded-xl border p-3.5 transition-all ${
                consentChecked ? 'bg-blue-500/20 border-blue-400/50' : 'bg-white/5 border-white/15 hover:border-white/30'
              }`}
            >
              <div
                className={`w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                  consentChecked ? 'bg-blue-500 border-blue-400' : 'border-white/30'
                }`}
              >
                {consentChecked && <CheckCircle2 size={12} className="text-white" />}
              </div>
              <p className="text-xs text-blue-100 leading-relaxed">
                I understand Receipt Pro is a record-keeping and extraction tool. I remain responsible for final review and tax filing accuracy.
              </p>
            </button>

            <button
              onClick={submit}
              disabled={loading || !consentChecked}
              className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </div>

          <button
            onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
            className="w-full text-center text-blue-300 hover:text-white text-sm mt-5 transition-colors"
          >
            {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AppShell({
  user,
  fileInputRef,
}: {
  user: any;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [role, setRole] = useState<Role>('Owner');
  const [roleOpen, setRoleOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);

  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);

  const [image, setImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ScanForm>({ ...BLANK_FORM });

  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRow | null>(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; msg: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const loadReceipts = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      showToast('error', 'Failed to load receipts.');
      setReceipts([]);
    } else {
      setReceipts((data ?? []) as ReceiptRow[]);
    }

    setLoading(false);
  }, [user.id, showToast]);

  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true);

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      showToast('error', 'Failed to load audit logs.');
      setAuditLogs([]);
    } else {
      setAuditLogs((data ?? []) as AuditLog[]);
    }

    setAuditLoading(false);
  }, [user.id, showToast]);

  const loadBusinessUnits = useCallback(async () => {
    const { data } = await supabase
      .from('business_units')
      .select('id,name')
      .order('name', { ascending: true });

    setBusinessUnits((data ?? []) as BusinessUnit[]);
  }, []);

  useEffect(() => {
    loadReceipts();
    loadBusinessUnits();
  }, [loadReceipts, loadBusinessUnits]);

  useEffect(() => {
    if (activeTab === 'audit') loadAuditLogs();
  }, [activeTab, loadAuditLogs]);

  const filteredReceipts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return receipts;
    return receipts.filter((r) => {
      return [
        r.vendor_name,
        r.vendor_address,
        r.category,
        r.vendor_tax_number,
        r.job_code,
        r.vehicle_id,
        r.transaction_date,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [receipts, search]);

  const stats = useMemo(() => {
    const total = receipts.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
    const tax = receipts.reduce((sum, r) => sum + Number(r.tax_amount || 0) + Number(r.pst_amount || 0), 0);
    const count = receipts.length;
    const avg = count ? total / count : 0;
    const missingBn = receipts.filter((r) => !r.vendor_tax_number).length;
    const needReview = receipts.filter((r) => Number(r.cra_readiness_score ?? 0) < 85).length;

    return { total, tax, count, avg, missingBn, needReview };
  }, [receipts]);

  const categoryData = useMemo(() => {
    return Object.entries(
      receipts.reduce<Record<string, number>>((acc, r) => {
        acc[r.category] = (acc[r.category] || 0) + Number(r.total_amount || 0);
        return acc;
      }, {}),
    )
      .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);
  }, [receipts]);

  const monthlyData = useMemo(() => {
    return Object.entries(
      receipts.reduce<Record<string, number>>((acc, r) => {
        const month = r.transaction_date?.slice(0, 7);
        if (month) acc[month] = (acc[month] || 0) + Number(r.total_amount || 0);
        return acc;
      }, {}),
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount: Math.round(amount * 100) / 100 }));
  }, [receipts]);

  const resetScan = () => {
    setImage(null);
    setFormData({ ...BLANK_FORM, device_info: navigator.userAgent, capture_source: 'camera' });
  };

  const readFileAsBase64 = (file: File) =>
    new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const source = fileInputRef.current?.capture ? 'camera' : 'upload';
    const base64 = await readFileAsBase64(file);
    const resized = await resizeImageTo2000(base64);

    setImage(resized);
    setFormData({
      ...BLANK_FORM,
      transaction_date: todayISO(),
      device_info: navigator.userAgent,
      capture_source: source === 'camera' ? 'camera' : 'upload',
    });
    setActiveTab('scan');

    if (e.target) e.target.value = '';
  };

  const processReceipt = async () => {
    if (!image) return;

    setScanning(true);

    const result = await scanReceipt(image);

    if (!result.success) {
      showToast('error', result.error);
      setScanning(false);
      return;
    }

    const data: ScannedReceiptData = result.data;

    setFormData((prev) => ({
      ...prev,
      vendor_name: data.vendor_name,
      vendor_address: data.vendor_address,
      vendor_tax_number: data.business_number,
      total_amount: data.total_amount,
      subtotal: data.subtotal,
      tax_amount: data.tax_amount,
      pst_amount: data.pst_amount,
      transaction_date: data.transaction_date,
      transaction_time: data.transaction_time,
      payment_method: data.payment_method,
      card_last_four: data.card_last_four,
      category: data.category,
      notes: data.notes,
      confidence_score: data.confidence_score,
      cra_readiness_score: data.cra_readiness_score,
      thermal_warning: data.thermal_warning,
      document_type: data.document_type,
      duplicate_warning: data.duplicate_warning,
      math_mismatch_warning: data.math_mismatch_warning,
      missing_bn_warning: data.missing_bn_warning,
    }));

    showToast('success', 'Receipt analyzed successfully.');
    setScanning(false);
  };

  const saveReceipt = async () => {
    if (!image) return;

    setSaving(true);

    try {
      showToast('info', 'Computing SHA-256 integrity hash…');
      const integrityHash = await computeSHA256(image);

      const blob = base64ToBlob(image);
      const filePath = `${user.id}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('receipt-images')
        .upload(filePath, blob, { contentType: 'image/jpeg', upsert: false });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('receipt-images').getPublicUrl(filePath);

      const payload = {
        user_id: user.id,
        business_unit_id: formData.business_unit_id || null,
        vendor_name: formData.vendor_name,
        vendor_address: formData.vendor_address,
        vendor_tax_number: formData.vendor_tax_number,
        total_amount: Number(formData.total_amount),
        subtotal: Number(formData.subtotal),
        tax_amount: Number(formData.tax_amount),
        pst_amount: Number(formData.pst_amount),
        transaction_date: formData.transaction_date,
        transaction_time: formData.transaction_time,
        payment_method: formData.payment_method,
        card_last_four: formData.card_last_four,
        category: formData.category,
        notes: formData.notes,
        currency: formData.currency,
        image_url: publicUrl,
        integrity_hash: integrityHash,
        confidence_score: Number(formData.confidence_score),
        cra_readiness_score: Number(formData.cra_readiness_score),
        thermal_warning: formData.thermal_warning,
        capture_source: formData.capture_source,
        device_info: formData.device_info,
        usage_type: formData.usage_type,
        business_use_percent: Number(formData.business_use_percent),
        job_code: formData.job_code,
        vehicle_id: formData.vehicle_id,
      };

      const { error: insertError } = await supabase.from('receipts').insert(payload);
      if (insertError) throw insertError;

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'receipt_created',
        details: [
          `Created receipt`,
          `Vendor: ${formData.vendor_name}`,
          `Total: ${fmt$(Number(formData.total_amount))}`,
          `Category: ${formData.category}`,
          `Usage: ${formData.usage_type}`,
          formData.job_code ? `Job: ${formData.job_code}` : null,
          formData.vehicle_id ? `Vehicle: ${formData.vehicle_id}` : null,
          `CRA Readiness: ${formData.cra_readiness_score}%`,
          `AI Confidence: ${formData.confidence_score}%`,
          `Hash: ${integrityHash.slice(0, 16)}…`,
          `App: ${APP_VERSION}`,
          `Agent: ${navigator.userAgent.slice(0, 120)}`,
        ]
          .filter(Boolean)
          .join(' | '),
      });

      await loadReceipts();
      resetScan();
      setActiveTab('receipts');
      showToast('success', 'Receipt saved and integrity-hashed successfully.');
    } catch (e: any) {
      showToast('error', `Save failed: ${e.message || 'Unknown error'}`);
    }

    setSaving(false);
  };

  const exportCSV = async () => {
    const csv = buildReceiptsCSV(filteredReceipts);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-pro-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'export_csv',
      details: `Exported ${filteredReceipts.length} receipt(s) to receipts.csv | App: ${APP_VERSION} | Agent: ${navigator.userAgent.slice(0, 90)}`,
    });

    showToast('success', 'CSV export downloaded.');
  };

  const exportAuditPackage = async () => {
    showToast('info', 'Building CRA audit package…');

    const zip = new JSZip();
    zip.file('receipts.csv', buildReceiptsCSV(filteredReceipts));
    zip.file('LOGBOOK.csv', buildLogbookCSV(filteredReceipts, user.email ?? 'unknown'));

    zip.file(
      'README.txt',
      [
        'Receipt Pro — CRA Audit Package',
        `App Version: ${APP_VERSION}`,
        `Generated: ${new Date().toISOString()}`,
        `Operator: ${user.email ?? 'unknown'}`,
        '',
        'Contents:',
        '  receipts.csv  - structured export of receipt data',
        '  LOGBOOK.csv   - image logbook with SHA-256 hash references',
        '  images/       - source receipt images',
        '',
        'Verification:',
        '  macOS/Linux: shasum -a 256 filename.jpg',
        '  Windows: CertUtil -hashfile filename.jpg SHA256',
        '',
        'Retention:',
        '  Keep records for at least six years from the end of the relevant tax year.',
      ].join('\n'),
    );

    const imagesFolder = zip.folder('images')!;

    await Promise.allSettled(
      filteredReceipts
        .filter((r) => r.image_url)
        .map(async (r) => {
          const res = await fetch(r.image_url!);
          const blob = await res.blob();
          const filename = `${r.transaction_date}_${r.vendor_name.replace(/[^a-zA-Z0-9]/g, '_')}_${r.id.slice(0, 8)}.jpg`;
          imagesFolder.file(filename, blob);
        }),
    );

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CRA-Audit-Package-${todayISO()}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'export_zip',
      details: `Exported CRA package with ${filteredReceipts.length} receipt(s) and ${filteredReceipts.filter((r) => r.image_url).length} image(s) | App: ${APP_VERSION} | Agent: ${navigator.userAgent.slice(0, 90)}`,
    });

    showToast('success', 'CRA audit package downloaded.');
  };

  const navTabs: { id: Tab; label: string; icon: React.ReactNode; center?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'receipts', label: 'Receipts', icon: <Receipt size={20} /> },
    { id: 'scan', label: 'Scan', icon: <Camera size={22} />, center: true },
    { id: 'export', label: 'Export', icon: <Download size={20} /> },
    { id: 'audit', label: 'Audit', icon: <ShieldCheck size={20} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-medium max-w-sm w-[calc(100%-2rem)] ${
            toast.type === 'error'
              ? 'bg-red-500 text-white'
              : toast.type === 'info'
              ? 'bg-blue-500 text-white'
              : 'bg-emerald-500 text-white'
          }`}
        >
          {toast.type === 'error' ? <AlertCircle size={16} /> : toast.type === 'info' ? <Info size={16} /> : <CheckCircle2 size={16} />}
          <span className="flex-1">{toast.msg}</span>
        </div>
      )}

      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/70 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center shadow-md flex-shrink-0">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-900 truncate">Receipt Pro</h1>
              <p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest mt-0.5">Canada · CRA Ready · v{APP_VERSION}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setRoleOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-full px-3 py-1.5 transition-all"
              >
                <UserCircle2 size={13} className="text-blue-500" />
                Role: {role}
                <ChevronDown size={11} className={`text-slate-400 transition-transform ${roleOpen ? 'rotate-180' : ''}`} />
              </button>

              {roleOpen && (
                <div className="absolute right-0 top-10 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 min-w-[180px] z-50">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2 px-1">Switch Role</p>
                  {(['Owner', 'Employee'] as Role[]).map((item) => (
                    <button
                      key={item}
                      onClick={() => {
                        setRole(item);
                        setRoleOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                        role === item ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Layers size={13} />
                      {item}
                      {role === item && <CheckCircle2 size={12} className="ml-auto text-blue-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => supabase.auth.signOut()}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors py-1.5 px-2.5 rounded-lg hover:bg-red-50"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-5 pt-6 pb-28">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
            <p className="text-slate-400 text-sm font-medium">Loading your workspace…</p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardTab
                stats={stats}
                categoryData={categoryData}
                monthlyData={monthlyData}
              />
            )}

            {activeTab === 'receipts' && (
              <ReceiptsTab
                receipts={filteredReceipts}
                search={search}
                setSearch={setSearch}
                onSelect={setSelectedReceipt}
                onRefresh={loadReceipts}
              />
            )}

            {activeTab === 'scan' && (
              <ScanTab
                image={image}
                scanning={scanning}
                saving={saving}
                formData={formData}
                setFormData={setFormData}
                businessUnits={businessUnits}
                onProcess={processReceipt}
                onSave={saveReceipt}
                onClear={resetScan}
                fileRef={fileInputRef}
              />
            )}

            {activeTab === 'export' && (
              <ExportTab receipts={filteredReceipts} onCSV={exportCSV} onAuditPackage={exportAuditPackage} />
            )}

            {activeTab === 'audit' && (
              <AuditTab logs={auditLogs} loading={auditLoading} onRefresh={loadAuditLogs} />
            )}
          </>
        )}
      </main>

      {selectedReceipt && <DetailView receipt={selectedReceipt} onClose={() => setSelectedReceipt(null)} />}

      <nav className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200/70 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
        <div className="max-w-5xl mx-auto px-2 py-2 flex items-center justify-around">
          {navTabs.map((tab) =>
            tab.center ? (
              <div key={tab.id} className="flex flex-col items-center gap-1 -mt-6">
                <div className="relative">
                  <button
                    onClick={() => {
                      setActiveTab('scan');
                      fileInputRef.current?.click();
                    }}
                    className="w-14 h-14 bg-blue-500 hover:bg-blue-600 active:scale-95 rounded-full flex items-center justify-center shadow-xl shadow-blue-500/40 transition-all"
                  >
                    <Camera className="w-6 h-6 text-white" />
                  </button>
                  <div
                    className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center border-2 border-white shadow-sm"
                    title="Thermal receipts fade quickly. Scan them immediately."
                  >
                    <Thermometer size={10} className="text-white" />
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-blue-500">Scan</span>
              </div>
            ) : (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
                  activeTab === tab.id ? 'text-blue-500' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {tab.icon}
                <span className="text-[10px] font-semibold">{tab.label}</span>
              </button>
            ),
          )}
        </div>

        {activeTab === 'scan' && (
          <div className="max-w-5xl mx-auto px-4 pb-2">
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <Thermometer size={13} className="text-amber-500 flex-shrink-0" />
              <p className="text-[11px] text-amber-700 font-medium leading-snug">
                <strong>Thermal receipt warning:</strong> Heat-sensitive receipts can fade quickly. Capture them right away and keep the original image in storage.
              </p>
            </div>
          </div>
        )}
      </nav>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      {roleOpen && <div className="fixed inset-0 z-40" onClick={() => setRoleOpen(false)} />}
    </div>
  );
}

function DashboardTab({
  stats,
  categoryData,
  monthlyData,
}: {
  stats: { total: number; tax: number; count: number; avg: number; missingBn: number; needReview: number };
  categoryData: { name: string; amount: number }[];
  monthlyData: { month: string; amount: number }[];
}) {
  const cards = [
    { label: 'Total Spend', value: fmt$(stats.total), icon: <Wallet size={18} className="text-blue-500" />, bg: 'bg-blue-50' },
    { label: 'Tax Captured', value: fmt$(stats.tax), icon: <DollarSign size={18} className="text-emerald-500" />, bg: 'bg-emerald-50' },
    { label: 'Receipts', value: String(stats.count), icon: <Hash size={18} className="text-violet-500" />, bg: 'bg-violet-50' },
    { label: 'Avg Receipt', value: fmt$(stats.avg), icon: <TrendingUp size={18} className="text-amber-500" />, bg: 'bg-amber-50' },
    { label: 'Missing BN', value: String(stats.missingBn), icon: <AlertCircle size={18} className="text-red-500" />, bg: 'bg-red-50' },
    { label: 'Need Review', value: String(stats.needReview), icon: <ShieldCheck size={18} className="text-indigo-500" />, bg: 'bg-indigo-50' },
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
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className={`w-9 h-9 ${card.bg} rounded-xl flex items-center justify-center mb-3`}>{card.icon}</div>
            <p className="text-xl font-bold text-slate-900 leading-tight">{card.value}</p>
            <p className="text-xs text-slate-400 font-medium mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {categoryData.length > 0 ? (
        <>
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Spending by Category</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categoryData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => (v.length > 10 ? `${v.slice(0, 10)}…` : v)} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="amount" radius={[8, 8, 0, 0]} fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {monthlyData.length > 1 && (
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4 uppercase tracking-wider">Monthly Trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthlyData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={fmtMonth} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6, fill: '#3b82f6' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-2xl p-10 border border-slate-100 text-center">
          <Receipt className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Scan your first receipt to start building your records vault.</p>
        </div>
      )}
    </div>
  );
}

function ReceiptsTab({
  receipts,
  search,
  setSearch,
  onSelect,
  onRefresh,
}: {
  receipts: ReceiptRow[];
  search: string;
  setSearch: (v: string) => void;
  onSelect: (r: ReceiptRow) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Receipts</h2>
          <p className="text-xs text-slate-400 mt-0.5">{receipts.length} records ready for review and export</p>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendor, BN, date, job code"
              className={`${inputCls} pl-9`}
            />
          </div>
          <button onClick={onRefresh} className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-blue-500 transition-all">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {receipts.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-100 text-center">
          <Receipt className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No receipts yet. Use Scan to add your first one.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {receipts.map((r) => {
            const confidenceTone = getConfidenceTone(r.confidence_score);
            return (
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-slate-900 truncate text-sm">{r.vendor_name}</p>
                      {r.integrity_hash && <Fingerprint size={11} className="text-emerald-500" />}
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${confidenceTone.pill}`}>
                        AI {Number(r.confidence_score ?? 0)}%
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${getReadinessTone(r.cra_readiness_score)}`}>
                        CRA {Number(r.cra_readiness_score ?? 0)}%
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-400">{fmtDate(r.transaction_date)}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-200" />
                      <span className="text-xs text-slate-400">{r.category}</span>
                      {r.job_code && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-slate-200" />
                          <span className="text-xs text-slate-400">Job {r.job_code}</span>
                        </>
                      )}
                      {r.card_last_four && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-slate-200" />
                          <span className="text-xs text-slate-400">····{r.card_last_four}</span>
                        </>
                      )}
                      {!r.vendor_tax_number && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-slate-200" />
                          <span className="text-xs text-amber-600 font-medium">Missing GST/BN</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="font-bold text-blue-600 text-sm">{fmt$(r.total_amount)}</span>
                    <ChevronRight size={14} className="text-slate-300" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScanTab({
  image,
  scanning,
  saving,
  formData,
  setFormData,
  businessUnits,
  onProcess,
  onSave,
  onClear,
  fileRef,
}: {
  image: string | null;
  scanning: boolean;
  saving: boolean;
  formData: ScanForm;
  setFormData: (v: ScanForm) => void;
  businessUnits: BusinessUnit[];
  onProcess: () => void;
  onSave: () => void;
  onClear: () => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  const hasData = !!(formData.vendor_name || formData.total_amount > 0);
  const confidenceTone = getConfidenceTone(formData.confidence_score);
  const readinessTone = getReadinessTone(formData.cra_readiness_score);
  const missingBn = !String(formData.vendor_tax_number || '').trim();
  const taxClaimed = Number(formData.tax_amount) > 0 || Number(formData.pst_amount) > 0;

  const setField = <K extends keyof ScanForm>(key: K, value: ScanForm[K]) => {
    setFormData({ ...formData, [key]: value });
  };

  return (
    <div className="grid lg:grid-cols-[1fr_1.05fr] gap-4 items-start">
      <div className="space-y-4">
        <div
          className={`relative overflow-hidden rounded-2xl border-2 transition-all ${
            image ? 'border-blue-200 bg-slate-100' : 'border-dashed border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/30'
          }`}
          style={{ aspectRatio: '4 / 3' }}
        >
          {!image ? (
            <button onClick={() => fileRef.current?.click()} className="w-full h-full flex flex-col items-center justify-center gap-3">
              <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100">
                <Camera className="w-10 h-10 text-blue-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-700">Tap to capture or upload</p>
                <p className="text-xs text-slate-400 mt-1">Native mobile camera · resized to 2000px before AI processing</p>
              </div>
            </button>
          ) : (
            <>
              <img src={image} alt="Receipt upload preview" className="w-full h-full object-contain" />
              <button onClick={onClear} className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors">
                <RefreshCw size={14} />
              </button>
              <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white rounded-full px-2.5 py-1">
                <Fingerprint size={11} />
                <span className="text-[10px] font-semibold">SHA-256 on save</span>
              </div>
            </>
          )}
        </div>

        {image && !scanning && !hasData && (
          <button
            onClick={onProcess}
            className="w-full bg-blue-500 hover:bg-blue-600 active:scale-[0.99] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-blue-500/25 transition-all"
          >
            <ScanLine size={20} />
            Analyze with Gemini 2.5 Flash
          </button>
        )}

        {scanning && (
          <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">Extracting Canadian receipt data…</p>
            <p className="text-xs text-slate-400 mt-1">Vendor · BN · GST · PST · total · date · payment · last 4</p>
          </div>
        )}

        <div className="space-y-3">
          {formData.thermal_warning && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex gap-2">
                <Thermometer size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Thermal-paper risk detected. Keep the original image and avoid relying on the paper receipt alone.
                </p>
              </div>
            </div>
          )}

          {formData.math_mismatch_warning && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex gap-2">
                <AlertCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700 leading-relaxed">
                  Math mismatch detected. Review subtotal, tax, and total before saving.
                </p>
              </div>
            </div>
          )}

          {formData.duplicate_warning && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
              <div className="flex gap-2">
                <Info size={14} className="text-violet-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-violet-700 leading-relaxed">
                  Possible duplicate detected by AI. Check vendor, amount, and date before saving.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Review & Verification</h3>
            <p className="text-xs text-slate-400 mt-0.5">Side-by-side human review before final save</p>
          </div>
          {image && (
            <button onClick={onProcess} className="text-xs text-blue-500 hover:text-blue-700 font-semibold flex items-center gap-1">
              <ScanLine size={12} />
              Re-scan
            </button>
          )}
        </div>

        <div className="p-5 space-y-5">
          <div className={`rounded-xl border px-4 py-3 ${confidenceTone.panel}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide">AI Confidence</span>
              <span className="text-sm font-bold">{formData.confidence_score}%</span>
            </div>
          </div>

          <div className={`rounded-xl border px-4 py-3 ${readinessTone}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide">CRA Readiness Score</span>
              <span className="text-sm font-bold">{formData.cra_readiness_score}%</span>
            </div>
            <p className="text-xs mt-1.5 leading-relaxed">
              Higher scores mean stronger audit readiness based on vendor identity, BN, totals, tax fields, and supporting notes.
            </p>
          </div>

          <Section title="Vendor">
            <Field label="Vendor Name" icon={<Building2 size={13} className="text-slate-400" />}>
              <input className={inputCls} value={formData.vendor_name} onChange={(e) => setField('vendor_name', e.target.value)} />
            </Field>

            <Field label="Vendor Address" icon={<MapPin size={13} className="text-slate-400" />}>
              <input
                className={inputCls}
                value={formData.vendor_address}
                onChange={(e) => setField('vendor_address', e.target.value)}
                placeholder="123 Main St, Edmonton, AB"
              />
            </Field>

            <Field label="Business Number (GST/BN)" icon={<Hash size={13} className="text-slate-400" />}>
              <div className="space-y-1.5">
                <input
                  className={missingBn && taxClaimed ? warningInputCls : inputCls}
                  value={formData.vendor_tax_number}
                  onChange={(e) => setField('vendor_tax_number', e.target.value.replace(/\s/g, '').toUpperCase())}
                  placeholder="123456789RT0001"
                />
                {missingBn && taxClaimed && (
                  <p className="text-xs text-yellow-700 font-medium">Yellow warning: GST/BN missing while tax is being claimed.</p>
                )}
              </div>
            </Field>
          </Section>

          <Section title="Transaction">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" icon={<CalendarDays size={13} className="text-slate-400" />}>
                <input type="date" className={inputCls} value={formData.transaction_date} onChange={(e) => setField('transaction_date', e.target.value)} />
              </Field>
              <Field label="Time" icon={<Clock size={13} className="text-slate-400" />}>
                <input type="time" className={inputCls} value={formData.transaction_time} onChange={(e) => setField('transaction_time', e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Amount Breakdown">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Subtotal" icon={<DollarSign size={13} className="text-slate-400" />}>
                <input type="number" step="0.01" min="0" className={inputCls} value={formData.subtotal} onChange={(e) => setField('subtotal', parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="GST" icon={<DollarSign size={13} className="text-emerald-500" />}>
                <input type="number" step="0.01" min="0" className={`${inputCls} border-emerald-200 focus:border-emerald-400 focus:ring-emerald-100`} value={formData.tax_amount} onChange={(e) => setField('tax_amount', parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="PST / HST" icon={<DollarSign size={13} className="text-violet-500" />}>
                <input type="number" step="0.01" min="0" className={`${inputCls} border-violet-200 focus:border-violet-400 focus:ring-violet-100`} value={formData.pst_amount} onChange={(e) => setField('pst_amount', parseFloat(e.target.value) || 0)} />
              </Field>
            </div>

            <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3 mt-1 border border-blue-100">
              <span className="text-sm font-semibold text-blue-700">Grand Total</span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-32 text-right font-bold text-blue-700 bg-transparent border-0 focus:outline-none text-base"
                value={formData.total_amount}
                onChange={(e) => setField('total_amount', parseFloat(e.target.value) || 0)}
              />
            </div>
          </Section>

          <Section title="Payment">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Method" icon={<CreditCard size={13} className="text-slate-400" />}>
                <select className={`${inputCls} bg-white`} value={formData.payment_method} onChange={(e) => setField('payment_method', e.target.value)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>

              <Field label="Card Last 4" icon={<CreditCard size={13} className="text-slate-400" />}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-sm font-mono select-none">····</span>
                  <input
                    className={`${inputCls} pl-10 font-mono tracking-widest`}
                    maxLength={4}
                    value={formData.card_last_four}
                    onChange={(e) => setField('card_last_four', e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="1234"
                  />
                </div>
              </Field>
            </div>
          </Section>

          <Section title="Construction / Field">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Job Code" icon={<Tag size={13} className="text-slate-400" />}>
                <input className={inputCls} value={formData.job_code} onChange={(e) => setField('job_code', e.target.value)} placeholder="JOB-2407" />
              </Field>

              <Field label="Vehicle ID" icon={<Truck size={13} className="text-slate-400" />}>
                <input className={inputCls} value={formData.vehicle_id} onChange={(e) => setField('vehicle_id', e.target.value)} placeholder="TRUCK-12" />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Usage Type" icon={<Layers size={13} className="text-slate-400" />}>
                <select className={`${inputCls} bg-white`} value={formData.usage_type} onChange={(e) => setField('usage_type', e.target.value as ScanForm['usage_type'])}>
                  {USAGE_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Business Use %" icon={<Hash size={13} className="text-slate-400" />}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className={inputCls}
                  value={formData.business_use_percent}
                  onChange={(e) => setField('business_use_percent', Math.min(100, Math.max(0, parseInt(e.target.value || '0', 10))))}
                />
              </Field>
            </div>

            <Field label="Business Unit" icon={<Building2 size={13} className="text-slate-400" />}>
              <select className={`${inputCls} bg-white`} value={formData.business_unit_id} onChange={(e) => setField('business_unit_id', e.target.value)}>
                <option value="">Select business unit</option>
                {businessUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          <Section title="Notes">
            <Field label="Business Purpose" icon={<FileText size={13} className="text-slate-400" />}>
              <textarea
                rows={3}
                className={`${inputCls} resize-none`}
                value={formData.notes}
                onChange={(e) => setField('notes', e.target.value)}
                placeholder="Explain why this purchase was for business use."
              />
            </Field>
          </Section>

          <Section title="Metadata">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Capture Source" icon={<Camera size={13} className="text-slate-400" />}>
                <input className={inputCls} value={formData.capture_source} readOnly />
              </Field>
              <Field label="Document Type" icon={<Receipt size={13} className="text-slate-400" />}>
                <input className={inputCls} value={formData.document_type} readOnly />
              </Field>
            </div>
          </Section>

          <div className="flex items-start gap-2.5 bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-100">
            <Fingerprint size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-700 leading-relaxed">
              On save, the image is fingerprinted with SHA-256 and stored alongside the receipt record for audit integrity and export logbook verification.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onSave}
              disabled={saving || !image}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 active:scale-[0.99] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/25 transition-all"
            >
              {saving ? <Loader2 className="animate-spin w-5 h-5" /> : <ShieldCheck size={20} />}
              {saving ? 'Hashing & Saving…' : 'Save Receipt'}
            </button>

            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-3">
              <Lock size={14} className="text-emerald-600" />
              <span className="font-medium whitespace-nowrap">Integrity locked on save</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportTab({
  receipts,
  onCSV,
  onAuditPackage,
}: {
  receipts: ReceiptRow[];
  onCSV: () => void;
  onAuditPackage: () => void;
}) {
  const totalImages = receipts.filter((r) => r.image_url).length;
  const hashedCount = receipts.filter((r) => r.integrity_hash).length;
  const totalGST = receipts.reduce((a, r) => a + Number(r.tax_amount || 0), 0);
  const totalPST = receipts.reduce((a, r) => a + Number(r.pst_amount || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Export</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          {receipts.length} records · {hashedCount} integrity-verified
        </p>
      </div>

      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-6 text-white shadow-xl shadow-blue-500/25">
        <PackageCheck className="w-10 h-10 mb-3 opacity-80" />
        <h3 className="font-bold text-lg">CRA Audit Package</h3>
        <p className="text-blue-100 text-sm mt-1">receipts.csv + LOGBOOK.csv + images/</p>

        <div className="grid grid-cols-4 gap-2 mt-5 text-center">
          {[
            { label: 'Receipts', value: receipts.length },
            { label: 'Images', value: totalImages },
            { label: 'GST', value: fmt$(totalGST) },
            { label: 'PST', value: fmt$(totalPST) },
          ].map((s) => (
            <div key={s.label} className="bg-white/10 rounded-xl p-2">
              <p className="font-bold text-sm leading-none">{s.value}</p>
              <p className="text-[9px] text-blue-200 mt-1 uppercase tracking-wide">{s.label}</p>
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
            <p className="font-bold text-slate-900">Export receipts.csv</p>
            <p className="text-xs text-slate-400 mt-0.5">Includes CRA score, AI score, construction fields, and SHA-256 hash</p>
          </div>
          <ChevronRight size={16} className="text-slate-300" />
        </button>

        <button
          onClick={onAuditPackage}
          disabled={receipts.length === 0}
          className="w-full bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-200 hover:border-indigo-200 rounded-2xl p-4 text-left flex items-center gap-4 shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
        >
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100 flex-shrink-0">
            <FileArchive className="w-6 h-6 text-indigo-500" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-slate-900">Download ZIP Audit Package</p>
            <p className="text-xs text-slate-400 mt-0.5">receipts.csv · LOGBOOK.csv · images/ folder</p>
          </div>
          <ChevronRight size={16} className="text-slate-300" />
        </button>
      </div>
    </div>
  );
}

function AuditTab({
  logs,
  loading,
  onRefresh,
}: {
  logs: AuditLog[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const actionMeta: Record<string, { label: string; color: string }> = {
    receipt_created: { label: 'Created', color: 'bg-emerald-100 text-emerald-700' },
    receipt_updated: { label: 'Updated', color: 'bg-blue-100 text-blue-700' },
    export_csv: { label: 'CSV', color: 'bg-violet-100 text-violet-700' },
    export_zip: { label: 'ZIP', color: 'bg-indigo-100 text-indigo-700' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Audit Log</h2>
          <p className="text-xs text-slate-400 mt-0.5">{logs.length} event(s)</p>
        </div>
        <button onClick={onRefresh} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-blue-500 transition-all">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-100 text-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading audit records…</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-100 text-center">
          <ShieldCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No audit events yet</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {logs.map((log) => {
            const meta = actionMeta[log.action] || { label: log.action, color: 'bg-slate-100 text-slate-600' };
            return (
              <div key={log.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 leading-snug">{log.details}</p>
                    <p className="text-xs text-slate-400 mt-1.5 font-mono">
                      {new Date(log.created_at).toLocaleString('en-CA', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full flex-shrink-0 ${meta.color}`}>{meta.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailView({
  receipt,
  onClose,
}: {
  receipt: ReceiptRow;
  onClose: () => void;
}) {
  const rows = [
    { label: 'Date', value: fmtDate(receipt.transaction_date), icon: <CalendarDays size={14} /> },
    receipt.transaction_time ? { label: 'Time', value: receipt.transaction_time, icon: <Clock size={14} /> } : null,
    { label: 'Category', value: receipt.category, icon: <Tag size={14} /> },
    { label: 'Usage', value: receipt.usage_type ?? '—', icon: <Layers size={14} /> },
    { label: 'Business Use %', value: `${receipt.business_use_percent ?? 0}%`, icon: <Hash size={14} /> },
    receipt.job_code ? { label: 'Job Code', value: receipt.job_code, icon: <Tag size={14} /> } : null,
    receipt.vehicle_id ? { label: 'Vehicle ID', value: receipt.vehicle_id, icon: <Truck size={14} /> } : null,
    { label: 'Subtotal', value: fmt$(receipt.subtotal ?? 0), icon: <DollarSign size={14} /> },
    { label: 'GST', value: fmt$(receipt.tax_amount), icon: <DollarSign size={14} className="text-emerald-500" /> },
    { label: 'PST/HST', value: fmt$(receipt.pst_amount ?? 0), icon: <DollarSign size={14} className="text-violet-500" /> },
    { label: 'Grand Total', value: fmt$(receipt.total_amount), icon: <Wallet size={14} /> },
    { label: 'Payment', value: `${receipt.payment_method}${receipt.card_last_four ? ` ····${receipt.card_last_four}` : ''}`, icon: <CreditCard size={14} /> },
    receipt.vendor_address ? { label: 'Address', value: receipt.vendor_address, icon: <MapPin size={14} /> } : null,
    receipt.vendor_tax_number ? { label: 'BN', value: receipt.vendor_tax_number, icon: <Building2 size={14} /> } : null,
    { label: 'AI Confidence', value: `${Number(receipt.confidence_score ?? 0)}%`, icon: <Info size={14} /> },
    { label: 'CRA Score', value: `${Number(receipt.cra_readiness_score ?? 0)}%`, icon: <ShieldCheck size={14} /> },
  ].filter(Boolean) as { label: string; value: string; icon: React.ReactNode }[];

  const confidenceTone = getConfidenceTone(receipt.confidence_score);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: CATEGORY_COLORS[receipt.category] || '#6b7280' }}
          >
            {receipt.vendor_name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-900 truncate">{receipt.vendor_name}</h2>
            <p className="text-xs text-slate-400">{fmtDate(receipt.transaction_date)}</p>
          </div>
          <span className="font-bold text-blue-600 text-base">{fmt$(receipt.total_amount)}</span>
        </div>

        <div className="overflow-y-auto flex-1">
          {receipt.image_url && (
            <div className="bg-slate-50 border-b border-slate-100">
              <img src={receipt.image_url} alt="Stored receipt" className="w-full max-h-80 object-contain" />
            </div>
          )}

          <div className="p-5">
            <div className={`mb-4 rounded-xl border px-4 py-3 ${confidenceTone.panel}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide">AI Confidence</p>
                <p className="text-sm font-bold">{Number(receipt.confidence_score ?? 0)}%</p>
              </div>
            </div>

            <div className="space-y-1">
              {rows.map((row) => (
                <div key={row.label} className="flex items-start justify-between py-2.5 border-b border-slate-50 last:border-0 gap-3">
                  <div className="flex items-center gap-2 text-slate-400 flex-shrink-0">
                    {row.icon}
                    <span className="text-xs font-semibold uppercase tracking-wide">{row.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900 text-right break-words max-w-[55%]">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {receipt.notes && (
            <div className="mx-5 bg-blue-50 rounded-2xl p-4 border border-blue-100">
              <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1.5">Business Purpose</p>
              <p className="text-sm text-blue-900">{receipt.notes}</p>
            </div>
          )}

          {receipt.integrity_hash && (
            <div className="mx-5 mt-3 mb-5 bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
              <div className="flex items-center gap-2 mb-1.5">
                <Fingerprint size={13} className="text-emerald-500" />
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">SHA-256 Integrity Hash</p>
              </div>
              <p className="text-[10px] font-mono text-emerald-700 break-all leading-relaxed">{receipt.integrity_hash}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
      {children}
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}