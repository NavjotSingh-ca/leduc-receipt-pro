// FILE 2: src/app/page.tsx (Full Pro Dashboard)
'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Camera, FileText, Download, FileArchive, History, Shield, CreditCard, DollarSign, Hash, Calendar,
  ReceiptText, ChevronRight, ArrowLeft, Loader2, RefreshCw, LogOut 
} from 'lucide-react';
import JSZip from 'jszip';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { scanReceipt, type ScanReceiptResult, type ScannedReceiptData } from './actions/scan-receipt';
import type { Database } from '@/types/supabase'; // Assume types generated

type Receipt = Database['public']['Tables']['receipts']['Row'];
type AuditLog = Database['public']['Tables']['audit_logs']['Row'];

type Tab = 'dashboard' | 'receipts' | 'scan' | 'export' | 'audit';

const todayISO = () => new Date().toISOString().split('T')[0];

const formatCurrency = (amount: number, currency: 'CAD' = 'CAD') => 
  new Intl.NumberFormat('en-CA', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};

const resizeImage = (base64: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      let { width, height } = img;
      if (width > 2000) {
        height = (height * 2000) / width;
        width = 2000;
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = base64;
  });
};

const base64ToBlob = (base64: string, mimeType = 'image/jpeg'): Blob => {
  const raw = base64.replace(/^data:image\/\w+;base64,/, '');
  const byteChars = atob(raw);
  const byteNums = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNums)], { type: mimeType });
};

export default function ReceiptPro() {
  const supabase = createClientComponentClient<Database>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, [supabase]);

  if (!user) return <AuthScreen supabase={supabase} />;

  // Dashboard states
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState({ total: 0, tax: 0, count: 0, avg: 0 });
  const [categoryData, setCategoryData] = useState<{ name: string; amount: number }[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ month: string; amount: number }[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

  // Scan states
  const [image, setImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [formData, setFormData] = useState({
    vendor_name: '', total_amount: 0, tax_amount: 0, vendor_tax_number: '',
    transaction_date: todayISO(), category: 'General Expense' as const, notes: '', payment_method: 'Visa', currency: 'CAD',
  });
  const [saving, setSaving] = useState(false);

  // Load data
  useEffect(() => {
    if (!user) return;
    loadDashboard();
    if (activeTab === 'audit') loadAudit();
  }, [user, activeTab]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      // Stats [web:9]
      const { data: sData } = await supabase
        .from('receipts')
        .select('total_amount, tax_amount')
        .eq('user_id', user.id)
        .throwOnError();
      const totals = sData?.reduce((acc, r) => ({ total: acc.total + r.total_amount, tax: acc.tax + r.tax_amount }), { total: 0, tax: 0 }) || { total: 0, tax: 0 };
      const count = sData?.length || 0;
      setStats({ total: totals.total, tax: totals.tax, count, avg: count ? totals.total / count : 0 });

      // Categories
      const { data: catData } = await supabase
        .from('receipts')
        .select('category, total_amount')
        .eq('user_id', user.id)
        .group('category')
        .order('total_amount', { ascending: false });
      setCategoryData(catData?.map(c => ({ name: c.category, amount: c.total_amount })) || []);

      // Monthly
      const { data: monData } = await supabase
        .from('receipts')
        .select('transaction_date, total_amount')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: true });
      const monthly = monData?.reduce((acc: Record<string, number>, r) => {
        const month = r.transaction_date.slice(0, 7);
        acc[month] = (acc[month] || 0) + r.total_amount;
        return acc;
      }, {}) || {};
      setMonthlyData(Object.entries(monthly).map(([month, amount]) => ({ month, amount })));
      setReceipts((await supabase.from('receipts').select('*').eq('user_id', user.id).order('created_at', { ascending: false })).data || []);
    } catch {}
    setLoading(false);
  };

  const loadAudit = async () => {
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setAuditLogs(data || []);
  };

  // Scan handlers
  const handleScanClick = () => fileInputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await new Promise<string>((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.readAsDataURL(file);
    });
    const resized = await resizeImage(base64); // Pre-process [web:2]
    setImage(resized);
  };

  const processReceipt = async () => {
    if (!image) return;
    setScanning(true);
    try {
      const result = await scanReceipt(image);
      if (result.success) {
        setFormData(prev => ({ ...prev, ...result.data }));
      } else {
        alert(`Scan error: ${result.error}`);
      }
    } catch (err: any) {
      alert(err.message);
    }
    setScanning(false);
  };

  const saveReceipt = async () => {
    if (!image || !user) return;
    setSaving(true);
    try {
      const blob = base64ToBlob(image);
      const filePath = `${user.id}/${Date.now()}.jpg`;
      await supabase.storage.from('receipt-images').upload(filePath, blob, { upsert: false });
      const { data: { publicUrl } } = supabase.storage.from('receipt-images').getPublicUrl(filePath);

      // Insert with audit-ready notes
      await supabase.from('receipts').insert({
        user_id: user.id,
        ...formData,
        image_url: publicUrl,
        payment_method: formData.payment_method,
      });

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'receipt_created',
        details: `Added: ${formData.vendor_name} $${formData.total_amount.toFixed(2)} (${formData.category})`,
      });

      setImage(null);
      Object.assign(formData, { vendor_name: '', total_amount: 0, tax_amount: 0, vendor_tax_number: '', notes: '', transaction_date: todayISO(), category: 'General Expense' });
      loadDashboard();
      setActiveTab('receipts');
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    }
    setSaving(false);
  };

  // Export
  const exportCSV = () => {
    const BOM = '\uFEFF';
    const headers = ['Date', 'Vendor', 'Category', 'Payment Method', 'Currency', 'Total', 'GST/HST', 'BN', 'Notes', 'Image'].map(escapeCSV).join(',');
    const rows = receipts.map(r => [
      formatDate(r.transaction_date),
      r.vendor_name,
      r.category,
      r.payment_method,
      r.currency,
      r.total_amount.toFixed(2),
      r.tax_amount.toFixed(2),
      r.vendor_tax_number,
      r.notes,
      r.image_url,
    ].map(escapeCSV).join(',')).join('\n');
    const csv = BOM + headers + '\n' + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-pro-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const escapeCSV = (v: any) => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;

  const exportZIP = async () => {
    const zip = new JSZip();
    zip.file('receipts.csv', '\uFEFF' + document.body.dataset.csvTemp || ''); // Set from CSV func or generate
    for (const r of receipts) {
      try {
        const imgRes = await fetch(r.image_url!);
        zip.file(`img/${r.id}.jpg`, imgRes.blob());
      } catch {}
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-pro-${todayISO()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/50 sticky top-0 z-50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg">
              <ReceiptText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Receipt Pro</h1>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">CRA Audit Ready</p>
            </div>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-2 text-sm text-slate-600 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-slate-100">
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 pb-24">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
            <p className="text-slate-500">Loading Pro Dashboard...</p>
          </div>
        ) : (
          <>
            {/* Content by tab */}
            {activeTab === 'dashboard' && (
              <DashboardTab stats={stats} categoryData={categoryData} monthlyData={monthlyData} />
            )}
            {activeTab === 'receipts' && (
              <ReceiptsTab receipts={receipts} onSelect={setSelectedReceipt} onRefresh={loadDashboard} />
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
                setImage={setImage}
              />
            )}
            {activeTab === 'export' && (
              <ExportTab receipts={receipts} onCSV={exportCSV} onZIP={exportZIP} />
            )}
            {activeTab === 'audit' && (
              <AuditTab logs={auditLogs} />
            )}

            {/* Fullscreen Detail */}
            {selectedReceipt && (
              <DetailView receipt={selectedReceipt} onClose={() => setSelectedReceipt(null)} />
            )}
          </>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/50 px-4 py-2 z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-around text-sm">
          <TabBtn active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<DollarSign size={20} />} label="Dashboard" />
          <TabBtn active={activeTab === 'receipts'} onClick={() => setActiveTab('receipts')} icon={<ReceiptText size={20} />} label="Receipts" />
          <TabBtn active={activeTab === 'scan'} onClick={() => setActiveTab('scan')} className="!bg-blue-500 !text-white shadow-lg rounded-full p-3 mx-2" icon={<Camera size={24} />} label="Scan" />
          <TabBtn active={activeTab === 'export'} onClick={() => setActiveTab('export')} icon={<Download size={20} />} label="Export" />
          <TabBtn active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} icon={<Shield size={20} />} label="Audit" />
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      </nav>
    </div>
  );
}

// Sub-components for clean structure
function AuthScreen({ supabase }: { supabase: any }) {
  // Reuse old auth logic from paste.txt, omitted for brevity
  return <div>Auth form here (from old page.tsx)</div>;
}

function DashboardTab({ stats, categoryData, monthlyData }: any) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<DollarSign />} title="Total Spend" value={formatCurrency(stats.total)} />
        <StatCard icon={<CreditCard />} title="GST/HST Paid" value={formatCurrency(stats.tax)} />
        <StatCard icon={<Hash />} title="Receipt Count" value={stats.count.toString()} />
        <StatCard icon={<DollarSign />} title="Avg Receipt" value={formatCurrency(stats.avg)} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">Spending by Category</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryData}>
              <CartesianGrid vertical={false} strokeOpacity={0.1} />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Amount']} />
              <Bar dataKey="amount" fill="hsl(220 70% 50%)" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">Monthly Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid vertical={false} strokeOpacity={0.1} />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Line type="monotone" dataKey="amount" stroke="hsl(220 70% 50%)" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, title, value }: any) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border hover:shadow-md transition-shadow group">
      <div className="flex items-center justify-between">
        <div className="p-3 bg-blue-100 rounded-xl group-hover:bg-blue-200 transition-colors">{icon}</div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          <p className="text-sm text-slate-500">{title}</p>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label, className = '' }: any) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${active ? 'text-blue-500 scale-105' : 'text-slate-500 hover:text-slate-700'} ${className}`}>
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function ReceiptsTab({ receipts, onSelect, onRefresh }: any) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Receipts ({receipts.length})</h2>
          <p className="text-sm text-slate-500">Newest first</p>
        </div>
        <RefreshCw className="w-5 h-5 text-slate-400 hover:text-blue-500 cursor-pointer transition-colors" onClick={onRefresh} />
      </div>
      <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
        {receipts.map((r: Receipt) => (
          <ReceiptItem key={r.id} receipt={r} onClick={() => onSelect(r)} />
        ))}
      </div>
    </div>
  );
}

function ReceiptItem({ receipt, onClick }: any) {
  return (
    <button onClick={onClick} className="w-full bg-white rounded-xl p-4 shadow-sm border hover:shadow-md transition-all hover:bg-blue-50">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 truncate">{receipt.vendor_name}</p>
          <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
            <span>{formatDate(receipt.transaction_date)}</span>
            <span>{receipt.category}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono font-bold text-lg text-blue-600">{formatCurrency(receipt.total_amount)}</p>
          <ChevronRight className="w-5 h-5 text-slate-400 ml-2" />
        </div>
      </div>
    </button>
  );
}

function ScanTab({ image, scanning, formData, saving, onFile, onProcess, onSave, onChange, fileRef, setImage }: any) {
  return (
    <div className="space-y-4">
      <div className="aspect-[4/3] bg-slate-100 rounded-2xl overflow-hidden border-2 border-dashed border-slate-200 relative group">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        {!image ? (
          <button onClick={() => fileRef.current?.click()} className="w-full h-full flex flex-col items-center justify-center text-slate-500 hover:text-blue-500 transition-colors group-hover:scale-105">
            <Camera className="w-16 h-16 mb-2 opacity-50" />
            <p className="font-medium">Tap to Scan Receipt</p>
            <p className="text-sm">High-res camera</p>
          </button>
        ) : (
          <img src={image} alt="Receipt" className="w-full h-full object-contain" />
        )}
      </div>
      {image && !scanning && (
        <button onClick={onProcess} className="w-full bg-blue-500 hover:bg-blue-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all">
          <Loader2 className="w-5 h-5 animate-spin" /> Analyze with AI
        </button>
      )}
      {scanning && (
        <div className="text-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Extracting data...</p>
        </div>
      )}
      {formData.vendor_name && (
        <div className="space-y-4 bg-white rounded-2xl p-6 shadow-sm border">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Review & Audit</h3>
            <button onClick={() => setImage(null)} className="text-slate-400 hover:text-slate-600">
              <RefreshCw size={18} />
            </button>
          </div>
          {/* Form fields - similar to old, with notes for purpose */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label>Total: <input type="number" value={formData.total_amount} onChange={(e) => onChange({ ...formData, total_amount: parseFloat(e.target.value) || 0 })} className="w-full p-2 border rounded-lg" /></label>
            {/* ... other fields incl notes textarea */}
            <label>Purpose: <textarea value={formData.notes} onChange={(e) => onChange({ ...formData, notes: e.target.value })} rows={2} className="col-span-2 p-2 border rounded-lg" placeholder="Infer business use..." /></label>
          </div>
          <button disabled={saving} onClick={onSave} className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg">
            {saving ? <Loader2 className="animate-spin" /> : <ReceiptText />}
            {saving ? 'Saving...' : 'Save Audit Record'}
          </button>
        </div>
      )}
    </div>
  );
}

function ExportTab({ receipts, onCSV, onZIP }: any) {
  return (
    <div className="space-y-6 text-center">
      <div className="w-24 h-24 bg-blue-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
        <Download className="w-12 h-12 text-blue-500" />
      </div>
      <div className="space-y-4">
        <button onClick={onCSV} disabled={receipts.length === 0} className="w-full max-w-md bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 mx-auto shadow-lg transition-all">
          <FileText size={20} /> Export CSV (Excel)
        </button>
        <button onClick={onZIP} disabled={receipts.length === 0} className="w-full max-w-md bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 mx-auto shadow-lg transition-all">
          <FileArchive size={20} /> Export ZIP (CSV + Images)
        </button>
      </div>
      <p className="text-sm text-slate-500">UTF-8 BOM for Excel compatibility [web:8]</p>
    </div>
  );
}

function AuditTab({ logs }: any) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2">Audit Logs</h2>
      <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
        {logs.map((log: AuditLog) => (
          <div key={log.id} className="bg-white rounded-xl p-4 shadow-sm border">
            <div className="flex items-start justify-between text-sm">
              <span className="font-mono text-xs text-slate-500">{log.created_at.slice(0, 16).replace('T', ' ')}</span>
              <span className="font-semibold px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs">{log.action}</span>
            </div>
            <p className="text-slate-900 mt-2">{log.details}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailView({ receipt, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full max-h-full overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 p-6 border-b flex items-center gap-4">
          <button onClick={onClose} className="p-2 rounded-2xl hover:bg-slate-100"><ArrowLeft size={20} /></button>
          <h2 className="font-bold text-xl">{receipt.vendor_name}</h2>
        </div>
        <div className="p-6 space-y-6">
          {receipt.image_url && <img src={receipt.image_url} alt="Receipt" className="w-full rounded-2xl object-contain max-h-96" />}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-slate-500">Total:</span> <span className="font-bold text-2xl text-green-600">{formatCurrency(receipt.total_amount)}</span></div>
            <div><span className="text-slate-500">Tax:</span> {formatCurrency(receipt.tax_amount)}</div>
            {/* More fields */}
          </div>
          {receipt.notes && <div><strong>Purpose:</strong> {receipt.notes}</div>}
        </div>
      </div>
    </div>
  );
}