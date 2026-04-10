'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Camera,
  CheckCircle,
  Save,
  LogOut,
  Loader2,
  RefreshCw,
  Tag,
  Calendar,
  Building,
  FileText,
  History,
  ScanLine,
  ChevronRight,
  ReceiptText,
  AlertCircle,
  ArrowLeft,
  Hash,
  Download,
  CreditCard,
  Banknote,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { scanReceipt } from '@/app/actions/scan-receipt';

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
  payment_method: string;
  currency: string;
  notes: string;
  image_url: string;
  created_at: string;
}

type Tab = 'scanner' | 'history';

// ── Helpers ────────────────────────────────────────────────────────────────────
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// ── Pure Utilities ─────────────────────────────────────────────────────────────
function base64ToBlob(base64: string, mimeType = 'image/jpeg'): Blob {
  const raw = base64.replace(/^data:image\/\w+;base64,/, '');
  const byteCharacters = atob(raw);
  const byteNumbers = new Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray as any], { type: mimeType });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCurrency(amount: number, currency = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function escapeCSVField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

function exportToCSV(receipts: Receipt[]): void {
  if (receipts.length === 0) return;

  const BOM = '\uFEFF';

  const HEADERS = [
    'Date',
    'Vendor',
    'Category',
    'Payment Method',
    'Currency',
    'Total Amount',
    'GST/HST',
    'Business Number (BN)',
    'Notes',
    'Image URL',
  ];

  const rows = receipts.map((r) => [
    escapeCSVField(formatDate(r.transaction_date)),
    escapeCSVField(r.vendor_name),
    escapeCSVField(r.category),
    escapeCSVField(r.payment_method),
    escapeCSVField(r.currency),
    escapeCSVField(r.total_amount.toFixed(2)),
    escapeCSVField(r.tax_amount.toFixed(2)),
    escapeCSVField(r.vendor_tax_number),
    escapeCSVField(r.notes),
    escapeCSVField(r.image_url),
  ]);

  const csv = [
    HEADERS.map(escapeCSVField).join(','),
    ...rows.map((r) => r.join(',')),
  ].join('\r\n');

  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const today = new Date().toISOString().split('T')[0];

  const a = document.createElement('a');
  a.href = url;
  a.download = `leduc-receipts-${today}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

/**
 * Returns true when running as an installed PWA on iOS 16 or below.
 * getUserMedia is broken in WKWebView standalone mode on those versions.
 */
function needsInputFallback(): boolean {
  if (typeof window === 'undefined') return false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (!isIOS) return false;

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator &&
      (window.navigator as any).standalone === true);

  if (!isStandalone) return false;

  const ver = parseInt(
    (navigator.userAgent.match(/OS (\d+)_/) ?? [])[1] ?? '0',
    10
  );

  return ver > 0 && ver < 17;
}

// ── Category badge colours ─────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  'Office Supplies': 'bg-blue-900/50 text-blue-300',
  'Meals & Entertainment': 'bg-orange-900/50 text-orange-300',
  Travel: 'bg-purple-900/50 text-purple-300',
  Fuel: 'bg-yellow-900/50 text-yellow-300',
  'Professional Fees': 'bg-green-900/50 text-green-300',
  Supplies: 'bg-cyan-900/50 text-cyan-300',
};
const DEFAULT_CAT = 'bg-slate-700 text-slate-300';

// ── Sub-components ─────────────────────────────────────────────────────────────
function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  const base =
    'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all';
  const on = 'bg-blue-600 text-white shadow-lg shadow-blue-900/40';
  const off = 'text-slate-400 hover:text-slate-200';

  return (
    <button onClick={onClick} className={`${base} ${active ? on : off}`}>
      {icon}
      {label}
    </button>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div className="flex items-center gap-2 text-slate-500 text-sm shrink-0">
        {icon}
        {label}
      </div>
      <span className="text-slate-200 text-sm text-right truncate max-w-[55%]">
        {value}
      </span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ReceiptScanner() {
  // ── Auth state
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // ── Scanner state
  const [image, setImage] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    vendor_name: '',
    total_amount: 0,
    tax_amount: 0,
    vendor_tax_number: '',
    transaction_date: todayISO(),
    category: 'General Expense',
    payment_method: 'Visa',
    currency: 'CAD',
    notes: '',
  });

  // ── Navigation
  const [activeTab, setActiveTab] = useState<Tab>('scanner');

  // ── History state
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  // ── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => setUser(session?.user ?? null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user ?? null)
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (activeTab === 'history' && user) void fetchReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user]);

  // ── Auth handlers ─────────────────────────────────────────────────────────────
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) setAuthError(error.message);
    setAuthLoading(false);
  };

  // ── Scanner handlers ──────────────────────────────────────────────────────────
  const startCamera = async () => {
    setImage(null);

    if (needsInputFallback()) {
      document.getElementById('ios-camera-fallback')?.click();
      return;
    }

    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      setStream(ms);
    } catch {
      document.getElementById('ios-camera-fallback')?.click();
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);

    setImage(canvas.toDataURL('image/jpeg', 0.8));
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  };

  const handleFileFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => setImage(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const processReceipt = async () => {
    if (!image) return;
    setIsProcessing(true);

    try {
      const result = await scanReceipt(image);

      if (!result.success) {
        alert(`Scan failed: ${result.error}`);
        return;
      }

      setFormData((prev) => ({
        ...prev,
        vendor_name: result.data.vendor_name,
        total_amount: result.data.total_amount,
        tax_amount: result.data.tax_amount,
        vendor_tax_number: result.data.vendor_tax_number,
        transaction_date: result.data.transaction_date,
        category: result.data.category,
      }));
    } catch (err: any) {
      alert(`Scan failed: ${err?.message || 'Unexpected error.'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetScanner = () => {
    setImage(null);
    setFormData({
      vendor_name: '',
      total_amount: 0,
      tax_amount: 0,
      vendor_tax_number: '',
      transaction_date: todayISO(),
      category: 'General Expense',
      payment_method: 'Visa',
      currency: 'CAD',
      notes: '',
    });
  };

  const handleSaveReceipt = async () => {
    if (!image || !user) return;
    setIsSaving(true);

    try {
      const blob = base64ToBlob(image);
      const filePath = `${user.id}/${Date.now()}.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from('receipt-images')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadErr) throw uploadErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from('receipt-images').getPublicUrl(filePath);

      const { error: dbErr } = await supabase.from('receipts').insert([
        {
          user_id: user.id,
          vendor_name: formData.vendor_name,
          total_amount: formData.total_amount,
          tax_amount: formData.tax_amount,
          vendor_tax_number: formData.vendor_tax_number,
          transaction_date: formData.transaction_date,
          category: formData.category,
          payment_method: formData.payment_method,
          currency: formData.currency,
          notes: formData.notes,
          image_url: publicUrl,
        },
      ]);

      if (dbErr) throw dbErr;

      resetScanner();
      await fetchReceipts();
      setActiveTab('history');
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ── History handlers ──────────────────────────────────────────────────────────
  const fetchReceipts = async () => {
    if (!user) return;
    setIsLoadingHistory(true);
    setHistoryError(null);

    try {
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReceipts(data ?? []);
    } catch (err: any) {
      setHistoryError(err.message);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // ── RENDER: Auth Screen
  // ─────────────────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <img
              src="/logo.png"
              className="w-20 h-20 mx-auto mb-4 rounded-2xl shadow-lg"
              alt="Logo"
            />
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Leduc Receipt Pro
            </h1>
            <p className="text-slate-500 text-sm mt-1 uppercase tracking-widest">
              Audit-Ready Scanner
            </p>
          </div>

          <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-6">
              {isSignUp ? 'Create your account' : 'Sign in to your account'}
            </h2>

            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-1">
                <label className="text-slate-400 text-xs uppercase font-bold tracking-wider block">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  required
                  className="w-full bg-slate-900 text-white p-3.5 rounded-xl border border-slate-700 focus:border-blue-500 focus:outline-none transition-colors placeholder:text-slate-600"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 text-xs uppercase font-bold tracking-wider block">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  required
                  className="w-full bg-slate-900 text-white p-3.5 rounded-xl border border-slate-700 focus:border-blue-500 focus:outline-none transition-colors placeholder:text-slate-600"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {authError && (
                <div className="flex items-center gap-2 bg-red-900/30 border border-red-800/50 text-red-300 text-sm p-3 rounded-xl">
                  <AlertCircle size={16} className="shrink-0" />
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors mt-2"
              >
                {authLoading && <Loader2 size={18} className="animate-spin" />}
                {isSignUp ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setAuthError(null);
              }}
              className="w-full mt-5 text-slate-500 hover:text-slate-300 text-sm transition-colors text-center"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ── RENDER: Receipt Detail Screen
  // ─────────────────────────────────────────────────────────────────────────────
  if (selectedReceipt) {
    return (
      <main className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center">
        <div className="w-full max-w-md pb-10">
          <header className="flex items-center gap-3 px-4 py-4 border-b border-slate-800 sticky top-0 bg-[#0f172a] z-10">
            <button
              onClick={() => setSelectedReceipt(null)}
              className="p-2 rounded-full hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-white truncate">
                {selectedReceipt.vendor_name}
              </h2>
              <p className="text-[11px] text-slate-500">
                {formatDate(selectedReceipt.transaction_date)}
              </p>
            </div>
            {selectedReceipt.category && (
              <span
                className={
                  'text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0 ' +
                  (CATEGORY_COLORS[selectedReceipt.category] ?? DEFAULT_CAT)
                }
              >
                {selectedReceipt.category}
              </span>
            )}
          </header>

          {selectedReceipt.image_url && (
            <div className="bg-slate-900 border-b border-slate-800">
              <img
                src={selectedReceipt.image_url}
                alt={`Receipt from ${selectedReceipt.vendor_name}`}
                className="w-full max-h-72 object-contain"
              />
            </div>
          )}

          <div className="p-4 space-y-3">
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Total Amount</span>
                <span className="text-3xl font-bold text-green-400 font-mono tabular-nums">
                  {formatCurrency(
                    selectedReceipt.total_amount,
                    selectedReceipt.currency || 'CAD'
                  )}
                </span>
              </div>
              <div className="h-px bg-slate-700 my-3" />
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">GST / HST Paid</span>
                <span className="text-slate-200 font-mono tabular-nums">
                  {formatCurrency(
                    selectedReceipt.tax_amount,
                    selectedReceipt.currency || 'CAD'
                  )}
                </span>
              </div>
            </div>

            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden divide-y divide-slate-700/60">
              <Field
                icon={<Building size={14} />}
                label="Vendor"
                value={selectedReceipt.vendor_name}
              />
              <Field
                icon={<Calendar size={14} />}
                label="Date"
                value={formatDate(selectedReceipt.transaction_date)}
              />
              <Field
                icon={<CreditCard size={14} />}
                label="Payment Method"
                value={selectedReceipt.payment_method || '—'}
              />
              <Field
                icon={<Banknote size={14} />}
                label="Currency"
                value={selectedReceipt.currency || 'CAD'}
              />
              <Field
                icon={<Hash size={14} />}
                label="Business Number"
                value={selectedReceipt.vendor_tax_number || '—'}
              />
              <Field
                icon={<Tag size={14} />}
                label="Category"
                value={selectedReceipt.category || '—'}
              />
            </div>

            {selectedReceipt.notes ? (
              <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 space-y-2">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1.5">
                  <FileText size={11} />
                  Business Purpose
                </p>
                <p className="text-slate-300 text-sm leading-relaxed">
                  {selectedReceipt.notes}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ── RENDER: Main App
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0f172a] text-white p-4 flex flex-col items-center">
      <header className="w-full max-w-md my-4 flex justify-between items-start px-2 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/logo.png"
            className="w-8 h-8 rounded-lg shadow-lg shrink-0"
            alt="Logo"
          />
          <div>
            <h1 className="font-bold text-blue-500 tracking-tight">
              Leduc Receipt Pro
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">
              Audit-Ready Scanner
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="text-slate-600 text-[11px] hidden sm:block truncate max-w-[160px]">
            {user.email}
          </span>
          <button
            onClick={() => supabase.auth.signOut()}
            title="Logout"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 border border-slate-700 rounded-xl bg-slate-800/70 hover:bg-slate-800 hover:text-red-300 hover:border-red-900/60 transition-colors"
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </header>

      <div className="w-full max-w-md mb-4">
        <div className="flex bg-slate-800 rounded-2xl p-1 border border-slate-700 gap-1">
          <TabButton
            active={activeTab === 'scanner'}
            onClick={() => setActiveTab('scanner')}
            icon={<ScanLine size={16} />}
            label="Scanner"
          />
          <TabButton
            active={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            icon={<History size={16} />}
            label={receipts.length > 0 ? `History (${receipts.length})` : 'History'}
          />
        </div>
      </div>

      {activeTab === 'scanner' && (
        <div className="w-full max-w-md bg-slate-800 rounded-3xl overflow-hidden border border-slate-700 shadow-xl">
          <input
            id="ios-camera-fallback"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileFallback}
          />

          {formData.vendor_name === '' ? (
            <>
              <div className="relative aspect-[3/4] bg-slate-900 flex items-center justify-center">
                {!image && !stream && (
                  <button
                    onClick={startCamera}
                    className="flex flex-col items-center gap-4 text-blue-500 hover:scale-110 active:scale-95 transition-transform"
                  >
                    <div className="w-20 h-20 rounded-full bg-blue-600/10 border-2 border-blue-500/30 flex items-center justify-center">
                      <Camera size={36} />
                    </div>
                    <span className="text-sm font-medium">Open Camera</span>
                  </button>
                )}

                {!image && stream && (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                )}

                {image && (
                  <img
                    src={image}
                    alt="Captured receipt"
                    className="w-full h-full object-cover opacity-80"
                  />
                )}

                {stream && (
                  <button
                    onClick={capturePhoto}
                    className="absolute bottom-6 bg-white text-black p-5 rounded-full shadow-2xl active:scale-90 transition-transform"
                  >
                    <CheckCircle size={32} />
                  </button>
                )}
              </div>

              {image && !isProcessing && (
                <div className="p-4 border-t border-slate-700 flex flex-col gap-2">
                  <button
                    onClick={() => void processReceipt()}
                    className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 py-4 rounded-xl font-bold transition-colors"
                  >
                    Analyze with AI
                  </button>
                  <button
                    onClick={startCamera}
                    className="text-slate-400 hover:text-slate-200 text-sm py-2 transition-colors"
                  >
                    Retake Photo
                  </button>
                </div>
              )}

              {isProcessing && (
                <div className="p-12 text-center flex flex-col items-center gap-4">
                  <Loader2 className="animate-spin text-blue-500" size={32} />
                  <p className="text-blue-400 animate-pulse text-sm font-medium">
                    Extracting Audit Data...
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-green-400">
                  Verify Audit Data
                </h2>
                <button
                  onClick={resetScanner}
                  className="text-slate-500 hover:text-slate-300 text-xs flex items-center gap-1 transition-colors"
                >
                  <RefreshCw size={12} />
                  Rescan
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-500 text-[10px] uppercase font-bold tracking-wider block">
                      Store Name
                    </label>
                    <input
                      type="text"
                      value={formData.vendor_name}
                      onChange={(e) =>
                        setFormData({ ...formData, vendor_name: e.target.value })
                      }
                      className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 focus:outline-none p-2.5 rounded-lg text-sm text-white transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-500 text-[10px] uppercase font-bold tracking-wider block text-right">
                      Date
                    </label>
                    <input
                      type="date"
                      value={formData.transaction_date}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          transaction_date: e.target.value,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 focus:outline-none p-2.5 rounded-lg text-sm text-white transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-500 text-[10px] uppercase font-bold tracking-wider block">
                      Total ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.total_amount}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          total_amount: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 focus:outline-none p-2.5 rounded-lg text-sm text-white transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-500 text-[10px] uppercase font-bold tracking-wider block">
                      GST/HST ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.tax_amount}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          tax_amount: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 focus:outline-none p-2.5 rounded-lg text-sm text-white transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-500 text-[10px] uppercase font-bold tracking-wider block">
                      Payment Method
                    </label>
                    <select
                      value={formData.payment_method}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          payment_method: e.target.value,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 focus:outline-none p-2.5 rounded-lg text-sm text-white transition-colors"
                    >
                      <option value="Visa">Visa</option>
                      <option value="MasterCard">MasterCard</option>
                      <option value="Amex">Amex</option>
                      <option value="Debit">Debit</option>
                      <option value="Cash">Cash</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-500 text-[10px] uppercase font-bold tracking-wider block">
                      Currency
                    </label>
                    <select
                      value={formData.currency}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          currency: e.target.value,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 focus:outline-none p-2.5 rounded-lg text-sm text-white transition-colors"
                    >
                      <option value="CAD">CAD</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500 text-[10px] uppercase font-bold tracking-wider block">
                    Business Number (BN)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 123456789RT0001"
                    value={formData.vendor_tax_number}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        vendor_tax_number: e.target.value,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 focus:outline-none p-2.5 rounded-lg text-sm text-white transition-colors"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500 text-[10px] uppercase font-bold tracking-wider block">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 focus:outline-none p-2.5 rounded-lg text-sm text-white transition-colors"
                  >
                    <option value="Office Supplies">Office Supplies</option>
                    <option value="Meals & Entertainment">
                      Meals &amp; Entertainment
                    </option>
                    <option value="Travel">Travel</option>
                    <option value="Fuel">Fuel</option>
                    <option value="Professional Fees">Professional Fees</option>
                    <option value="Supplies">Supplies</option>
                    <option value="General Expense">General Expense</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500 text-[10px] uppercase font-bold tracking-wider block">
                    Business Purpose
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    placeholder="Why was this purchased? (Required by CRA)"
                    rows={3}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 focus:outline-none p-2.5 rounded-lg text-sm text-white transition-colors resize-none"
                  />
                </div>
              </div>

              <button
                disabled={isSaving}
                onClick={handleSaveReceipt}
                className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-60 active:bg-green-700 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/20"
              >
                {isSaving ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <Save size={20} />
                )}
                {isSaving ? 'Saving Audit Record...' : 'Confirm & Save Audit Record'}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="w-full max-w-md space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-slate-500 text-xs">
              {!isLoadingHistory && receipts.length > 0
                ? `${receipts.length} record${receipts.length !== 1 ? 's' : ''}`
                : ' '}
            </p>

            <div className="flex items-center gap-1">
              <button
                onClick={() => exportToCSV(receipts)}
                disabled={isLoadingHistory || receipts.length === 0}
                title="Download CSV for Excel"
                className={
                  isLoadingHistory || receipts.length === 0
                    ? 'flex items-center gap-1.5 text-slate-600 text-sm py-1.5 px-3 rounded-lg cursor-not-allowed'
                    : 'flex items-center gap-1.5 text-slate-400 hover:text-green-400 hover:bg-green-400/10 transition-colors text-sm py-1.5 px-3 rounded-lg'
                }
              >
                <Download size={13} />
                <span>Export</span>
              </button>

              <button
                onClick={() => void fetchReceipts()}
                disabled={isLoadingHistory}
                className="flex items-center gap-1.5 text-slate-400 hover:text-blue-400 transition-colors text-sm py-1.5 px-3 rounded-lg"
              >
                <RefreshCw
                  size={13}
                  className={isLoadingHistory ? 'animate-spin' : ''}
                />
                Refresh
              </button>
            </div>
          </div>

          {isLoadingHistory && (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-slate-800 rounded-2xl p-4 border border-slate-700 animate-pulse"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-2.5">
                      <div className="h-4 w-40 bg-slate-700 rounded-md" />
                      <div className="h-3 w-24 bg-slate-700/50 rounded-md" />
                    </div>
                    <div className="h-5 w-20 bg-slate-700 rounded-md" />
                  </div>
                  <div className="mt-3 h-5 w-24 bg-slate-700/40 rounded-full" />
                </div>
              ))}
            </div>
          )}

          {!isLoadingHistory && historyError && (
            <div className="bg-red-900/20 border border-red-800/40 rounded-2xl p-8 text-center space-y-3">
              <AlertCircle size={28} className="mx-auto text-red-400" />
              <p className="text-red-300 font-semibold text-sm">
                Could not load receipts
              </p>
              <p className="text-red-400/60 text-xs">{historyError}</p>
              <button
                onClick={() => void fetchReceipts()}
                className="mt-1 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-600 px-4 py-2 rounded-xl transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {!isLoadingHistory && !historyError && receipts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mb-1">
                <ReceiptText size={28} className="text-slate-600" />
              </div>
              <h3 className="text-slate-200 font-semibold">No receipts yet</h3>
              <p className="text-slate-500 text-sm max-w-[220px] leading-relaxed">
                Scan your first receipt to start building your CRA audit trail.
              </p>
              <button
                onClick={() => setActiveTab('scanner')}
                className="mt-3 bg-blue-600 hover:bg-blue-500 transition-colors px-5 py-2.5 rounded-xl text-sm font-semibold"
              >
                Scan a Receipt
              </button>
            </div>
          )}

          {!isLoadingHistory && !historyError && receipts.length > 0 && (
            <div className="space-y-2.5">
              {receipts.map((receipt) => (
                <button
                  key={receipt.id}
                  onClick={() => setSelectedReceipt(receipt)}
                  className="w-full text-left bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-2xl p-4 transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate group-hover:text-blue-300 transition-colors">
                        {receipt.vendor_name}
                      </p>
                      <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                        <Calendar size={10} />
                        {formatDate(receipt.transaction_date)}
                      </p>
                      <p className="text-slate-400 text-xs mt-1 flex items-center gap-1">
                        <CreditCard size={10} />
                        {receipt.payment_method || '—'}
                        <span className="text-slate-600">•</span>
                        {receipt.currency || 'CAD'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-green-400 font-bold font-mono tabular-nums text-sm">
                        {formatCurrency(
                          receipt.total_amount,
                          receipt.currency || 'CAD'
                        )}
                      </span>
                      <ChevronRight
                        size={16}
                        className="text-slate-600 group-hover:text-slate-400 transition-colors"
                      />
                    </div>
                  </div>

                  {receipt.category && (
                    <div className="mt-2.5">
                      <span
                        className={
                          'text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ' +
                          (CATEGORY_COLORS[receipt.category] ?? DEFAULT_CAT)
                        }
                      >
                        {receipt.category}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}