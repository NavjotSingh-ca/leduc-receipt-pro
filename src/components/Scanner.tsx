'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock,
  CreditCard,
  Crop,
  DollarSign,
  FileImage,
  FileText,
  Fingerprint,
  Hash,
  Info,
  Loader2,
  Receipt,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Tag,
  Thermometer,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { scanReceipt, type ReceiptLineItem, type ScannedReceiptData } from '@/app/actions/scan-receipt';

interface BusinessUnit {
  id: string;
  name: string;
}

interface ReceiptRow {
  id: string;
  user_id: string;
  business_unit_id?: string | null;
  vendor_name: string;
  vendor_address?: string | null;
  business_number?: string | null;
  vendor_tax_number?: string | null;
  total_amount: number;
  subtotal?: number | null;
  tax_amount: number;
  pst_amount?: number | null;
  transaction_date: string;
  transaction_time?: string | null;
  payment_method: string;
  payment_reference?: string | null;
  card_last_four?: string | null;
  category: string;
  notes: string;
  currency: string;
  image_url?: string | null;
  source_file_name?: string | null;
  source_file_type?: string | null;
  integrity_hash?: string | null;
  duplicate_hash?: string | null;
  confidence_score?: number | null;
  cra_readiness_score?: number | null;
  thermal_warning?: boolean | null;
  capture_source?: string | null;
  usage_type?: 'business' | 'personal' | 'mixed' | null;
  business_use_percent?: number | null;
  job_code?: string | null;
  vehicle_id?: string | null;
  line_items?: ReceiptLineItem[] | null;
  created_at?: string | null;
  updated_at?: string | null;
}

type ToastState = {
  type: 'success' | 'error' | 'info';
  msg: string;
} | null;

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ReceiptForm = {
  vendor_name: string;
  vendor_address: string;
  business_number: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  pst_amount: number;
  transaction_date: string;
  transaction_time: string;
  payment_method: string;
  payment_reference: string;
  card_last_four: string;
  category: string;
  notes: string;
  currency: string;
  confidence_score: number;
  cra_readiness_score: number;
  thermal_warning: boolean;
  document_type: 'receipt' | 'invoice' | 'statement' | 'unknown';
  duplicate_warning: boolean;
  duplicate_hash: string;
  math_mismatch_warning: boolean;
  missing_bn_warning: boolean;
  capture_source: 'camera' | 'upload';
  usage_type: 'business' | 'personal' | 'mixed';
  business_use_percent: number;
  job_code: string;
  vehicle_id: string;
  business_unit_id: string;
  line_items: ReceiptLineItem[];
};

const APP_VERSION = '4.0.0-CA-ENTERPRISE';

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

const inputCls =
  'w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all bg-white';

const warningInputCls =
  'w-full rounded-xl border border-yellow-400 bg-yellow-50/70 px-3 py-2.5 text-sm text-slate-900 placeholder:text-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-100 focus:border-yellow-500 transition-all';

const todayISO = () => new Date().toISOString().split('T')[0];

const BLANK_FORM: ReceiptForm = {
  vendor_name: '',
  vendor_address: '',
  business_number: '',
  total_amount: 0,
  subtotal: 0,
  tax_amount: 0,
  pst_amount: 0,
  transaction_date: todayISO(),
  transaction_time: '',
  payment_method: 'Unknown',
  payment_reference: '',
  card_last_four: '',
  category: 'General Expense',
  notes: '',
  currency: 'CAD',
  confidence_score: 0,
  cra_readiness_score: 0,
  thermal_warning: false,
  document_type: 'unknown',
  duplicate_warning: false,
  duplicate_hash: '',
  math_mismatch_warning: false,
  missing_bn_warning: false,
  capture_source: 'camera',
  usage_type: 'business',
  business_use_percent: 100,
  job_code: '',
  vehicle_id: '',
  business_unit_id: '',
  line_items: [],
};

const fmt$ = (n: number) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(Number.isFinite(n) ? n : 0);

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

async function cropImageToDataUrl(base64: string, crop: CropRect): Promise<string> {
  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(crop.width));
      canvas.height = Math.max(1, Math.round(crop.height));
      const ctx = canvas.getContext('2d');

      ctx?.drawImage(
        img,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      resolve(canvas.toDataURL('image/jpeg', 0.9));
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

function createDuplicateHash(vendorName: string, transactionDate: string, totalAmount: number): string {
  const normalized = `${vendorName.trim().toLowerCase()}|${transactionDate.trim()}|${Number(totalAmount || 0).toFixed(2)}`;
  return normalized;
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

function mapScanDataToForm(data: ScannedReceiptData): ReceiptForm {
  return {
    vendor_name: data.vendor_name,
    vendor_address: data.vendor_address,
    business_number: data.business_number,
    total_amount: data.total_amount,
    subtotal: data.subtotal,
    tax_amount: data.tax_amount,
    pst_amount: data.pst_amount,
    transaction_date: data.transaction_date,
    transaction_time: data.transaction_time,
    payment_method: data.payment_method,
    payment_reference: data.payment_reference,
    card_last_four: data.card_last_four,
    category: data.category,
    notes: data.notes,
    currency: 'CAD',
    confidence_score: data.confidence_score,
    cra_readiness_score: data.cra_readiness_score,
    thermal_warning: data.thermal_warning,
    document_type: data.document_type,
    duplicate_warning: data.duplicate_warning,
    duplicate_hash: data.duplicate_hash,
    math_mismatch_warning: data.math_mismatch_warning,
    missing_bn_warning: data.missing_bn_warning,
    capture_source: 'camera',
    usage_type: 'business',
    business_use_percent: 100,
    job_code: '',
    vehicle_id: '',
    business_unit_id: '',
    line_items: data.line_items ?? [],
  };
}

function Toast({ toast }: { toast: Exclude<ToastState, null> }) {
  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-medium max-w-md w-[calc(100%-2rem)] ${
        toast.type === 'error'
          ? 'bg-red-500 text-white'
          : toast.type === 'info'
          ? 'bg-blue-500 text-white'
          : 'bg-emerald-500 text-white'
      }`}
    >
      {toast.type === 'error' ? <AlertCircle size={16} /> : toast.type === 'info' ? <Info size={16} /> : <CheckCircle2 size={16} />}
      <span>{toast.msg}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

function ManualCropperModal({
  imageSrc,
  fileName,
  onCancel,
  onApply,
}: {
  imageSrc: string;
  fileName: string;
  onCancel: () => void;
  onApply: (cropped: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const draggingRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const [crop, setCrop] = useState<CropRect | null>(null);
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImgSize({ width: img.width, height: img.height });
      setCrop({
        x: img.width * 0.1,
        y: img.height * 0.1,
        width: img.width * 0.8,
        height: img.height * 0.8,
      });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !crop) return;

    const maxWidth = Math.min(window.innerWidth - 48, 900);
    const ratio = img.height / img.width;
    canvas.width = maxWidth;
    canvas.height = maxWidth * ratio;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / img.width;
    const scaleY = canvas.height / img.height;
    const rectX = crop.x * scaleX;
    const rectY = crop.y * scaleY;
    const rectW = crop.width * scaleX;
    const rectH = crop.height * scaleY;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(
      img,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      rectX,
      rectY,
      rectW,
      rectH,
    );

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(rectX, rectY, rectW, rectH);

    const handleSize = 10;
    ctx.fillStyle = '#ffffff';
    [
      [rectX, rectY],
      [rectX + rectW, rectY],
      [rectX, rectY + rectH],
      [rectX + rectW, rectY + rectH],
    ].forEach(([x, y]) => {
      ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
    });
  }, [crop]);

  useEffect(() => {
    draw();
  }, [draw]);

  const getPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * imgSize.width;
    const y = ((e.clientY - rect.top) / rect.height) * imgSize.height;
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!imageRef.current) return;
    draggingRef.current = true;
    startRef.current = getPointer(e);
    const p = getPointer(e);
    setCrop({ x: p.x, y: p.y, width: 1, height: 1 });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current || !startRef.current) return;
    const p = getPointer(e);
    const start = startRef.current;

    setCrop({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      width: Math.abs(p.x - start.x),
      height: Math.abs(p.y - start.y),
    });
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
    startRef.current = null;
  };

  const applyCrop = async () => {
    if (!crop || crop.width < 20 || crop.height < 20) return;
    const cropped = await cropImageToDataUrl(imageSrc, crop);
    onApply(cropped);
  };

  const autoFull = () => {
    setCrop({
      x: 0,
      y: 0,
      width: imgSize.width,
      height: imgSize.height,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Crop size={18} className="text-blue-500" />
              Manual Cropper
            </h3>
            <p className="text-xs text-slate-400 mt-1 truncate">{fileName}</p>
          </div>
          <button onClick={onCancel} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 bg-slate-50">
          <div className="rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center">
            <canvas
              ref={canvasRef}
              className="max-w-full touch-none cursor-crosshair"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Drag to draw the crop area. Re-drag if you want to redefine the selection.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={autoFull}
            className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-600"
          >
            Use Full Image
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              onClick={applyCrop}
              className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold"
            >
              Apply Crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DuplicateModal({
  candidate,
  onCancel,
  onContinue,
}: {
  candidate: ReceiptRow;
  onCancel: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Possible Duplicate Found!</h3>
              <p className="text-sm text-slate-400 mt-1">A matching Vendor + Date + Total record already exists.</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="font-semibold text-slate-900">{candidate.vendor_name}</p>
            <p className="text-xs text-slate-400 mt-1">{candidate.transaction_date}</p>
            <p className="text-sm font-bold text-blue-600 mt-2">{fmt$(candidate.total_amount)}</p>
          </div>

          <p className="text-sm text-slate-600">
            Do you still want to save this new receipt record?
          </p>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={onContinue}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold"
          >
            Save Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Scanner({
  user,
  onSaveSuccess,
}: {
  user: any;
  onSaveSuccess: () => void;
}) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [toast, setToast] = useState<ToastState>(null);

  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);

  const [image, setImage] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPreviewName, setPdfPreviewName] = useState('');
  const [sourceFileName, setSourceFileName] = useState('');
  const [sourceFileType, setSourceFileType] = useState<'image' | 'pdf' | ''>('');
  const [formData, setFormData] = useState<ReceiptForm>({ ...BLANK_FORM });

  const [duplicateCandidate, setDuplicateCandidate] = useState<ReceiptRow | null>(null);
  const [pendingDuplicateSave, setPendingDuplicateSave] = useState(false);

  const [cropOpen, setCropOpen] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropSourceName, setCropSourceName] = useState('');
  const [cropSourceCapture, setCropSourceCapture] = useState<'camera' | 'upload'>('upload');

  const showToast = useCallback((type: 'success' | 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const loadBusinessUnits = useCallback(async () => {
    const { data } = await supabase.from('business_units').select('id,name').order('name', { ascending: true });
    setBusinessUnits((data ?? []) as BusinessUnit[]);
  }, []);

  useEffect(() => {
    loadBusinessUnits();
  }, [loadBusinessUnits]);

  const resetScanState = () => {
    setImage(null);
    setPdfFile(null);
    setPdfPreviewName('');
    setSourceFileName('');
    setSourceFileType('');
    setFormData({ ...BLANK_FORM });
    setPendingDuplicateSave(false);
  };

  const openCropper = async (file: File, captureSource: 'camera' | 'upload') => {
    const reader = new FileReader();
    reader.onload = () => {
      setCropSource(reader.result as string);
      setCropSourceName(file.name);
      setCropSourceCapture(captureSource);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleImageInput = async (e: React.ChangeEvent<HTMLInputElement>, captureSource: 'camera' | 'upload') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('error', 'Please select an image file.');
      if (e.target) e.target.value = '';
      return;
    }

    await openCropper(file, captureSource);
    if (e.target) e.target.value = '';
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileType = file.type.toLowerCase();
    const isPdf = fileType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = fileType.startsWith('image/');

    if (!isPdf && !isImage) {
      showToast('error', 'Supported files are PDF, JPG, PNG.');
      if (e.target) e.target.value = '';
      return;
    }

    if (isPdf) {
      resetScanState();
      setPdfFile(file);
      setPdfPreviewName(file.name);
      setSourceFileName(file.name);
      setSourceFileType('pdf');
      setFormData((prev) => ({ ...prev, capture_source: 'upload' }));
      showToast('info', 'PDF attached. OCR scan requires an image. You can still upload and store the original PDF record.');
    } else {
      await openCropper(file, 'upload');
    }

    if (e.target) e.target.value = '';
  };

  const processReceipt = async () => {
    if (!image) {
      showToast('error', 'Please capture or crop an image before scanning.');
      return;
    }

    setScanning(true);

    try {
      const result = await scanReceipt(image);

      if (!result.success) {
        showToast('error', result.error);
        setScanning(false);
        return;
      }

      setFormData((prev) => ({
        ...prev,
        ...mapScanDataToForm(result.data),
        capture_source: prev.capture_source,
        business_unit_id: prev.business_unit_id,
        usage_type: prev.usage_type,
        business_use_percent: prev.business_use_percent,
        job_code: prev.job_code,
        vehicle_id: prev.vehicle_id,
      }));

      showToast('success', 'Receipt analyzed successfully.');
    } catch (e: any) {
      showToast('error', e?.message || 'Scan failed.');
    } finally {
      setScanning(false);
    }
  };

  const insertAudit = async (action: string, details: string) => {
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action,
      details,
    });
  };

  const findDuplicate = async (duplicateHash: string) => {
    const { data } = await supabase
      .from('receipts')
      .select('*')
      .eq('user_id', user.id)
      .eq('duplicate_hash', duplicateHash)
      .limit(1)
      .maybeSingle();

    return data as ReceiptRow | null;
  };

  const executeSave = async () => {
    setSaving(true);

    try {
      const duplicate_hash = formData.duplicate_hash || createDuplicateHash(formData.vendor_name, formData.transaction_date, formData.total_amount);
      const duplicate = await findDuplicate(duplicate_hash);

      if (duplicate && !pendingDuplicateSave) {
        setDuplicateCandidate(duplicate);
        setSaving(false);
        return;
      }

      let imageUrl: string | null = null;
      let storedFileName = sourceFileName || '';
      let storedFileType = sourceFileType || '';

      if (image) {
        showToast('info', 'Computing SHA-256 integrity hash.');
        const integrityHash = await computeSHA256(image);
        const blob = base64ToBlob(image);
        const filePath = `${user.id}/${Date.now()}-${(sourceFileName || 'receipt').replace(/\s+/g, '_')}.jpg`;

        const { error: uploadErr } = await supabase.storage.from('receipt-images').upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: false,
        });

        if (uploadErr) throw uploadErr;
        const { data: publicData } = supabase.storage.from('receipt-images').getPublicUrl(filePath);
        imageUrl = publicData.publicUrl;
        storedFileName = storedFileName || filePath.split('/').pop() || 'receipt.jpg';
        storedFileType = 'image';

        const payload = {
          user_id: user.id,
          business_unit_id: formData.business_unit_id || null,
          vendor_name: formData.vendor_name,
          vendor_address: formData.vendor_address,
          business_number: formData.business_number,
          total_amount: Number(formData.total_amount),
          subtotal: Number(formData.subtotal),
          tax_amount: Number(formData.tax_amount),
          pst_amount: Number(formData.pst_amount),
          transaction_date: formData.transaction_date,
          transaction_time: formData.transaction_time,
          payment_method: formData.payment_method,
          payment_reference: formData.payment_reference,
          card_last_four: formData.card_last_four,
          category: formData.category,
          notes: formData.notes,
          currency: formData.currency,
          image_url: imageUrl,
          source_file_name: storedFileName,
          source_file_type: storedFileType,
          integrity_hash: integrityHash,
          duplicate_hash,
          confidence_score: Number(formData.confidence_score ?? 0),
          cra_readiness_score: Number(formData.cra_readiness_score ?? 0),
          thermal_warning: formData.thermal_warning,
          capture_source: formData.capture_source,
          usage_type: formData.usage_type,
          business_use_percent: Number(formData.business_use_percent ?? 100),
          job_code: formData.job_code,
          vehicle_id: formData.vehicle_id,
          line_items: formData.line_items,
        };

        const { error: insertErr } = await supabase.from('receipts').insert(payload);
        if (insertErr) throw insertErr;

        await insertAudit(
          'receipt_created',
          `Created receipt ${formData.vendor_name} ${fmt$(formData.total_amount)} duplicate ${duplicate_hash.slice(0, 12)} hash ${integrityHash.slice(0, 12)} App ${APP_VERSION}`,
        );
      } else if (pdfFile) {
        const filePath = `${user.id}/${Date.now()}-${pdfFile.name.replace(/\s+/g, '_')}`;
        const { error: uploadErr } = await supabase.storage.from('receipt-images').upload(filePath, pdfFile, {
          contentType: pdfFile.type || 'application/pdf',
          upsert: false,
        });

        if (uploadErr) throw uploadErr;
        const { data: publicData } = supabase.storage.from('receipt-images').getPublicUrl(filePath);
        imageUrl = publicData.publicUrl;
        storedFileName = pdfFile.name;
        storedFileType = 'pdf';

        const payload = {
          user_id: user.id,
          business_unit_id: formData.business_unit_id || null,
          vendor_name: formData.vendor_name || pdfFile.name.replace(/\.pdf$/i, ''),
          vendor_address: formData.vendor_address,
          business_number: formData.business_number,
          total_amount: Number(formData.total_amount),
          subtotal: Number(formData.subtotal),
          tax_amount: Number(formData.tax_amount),
          pst_amount: Number(formData.pst_amount),
          transaction_date: formData.transaction_date,
          transaction_time: formData.transaction_time,
          payment_method: formData.payment_method,
          payment_reference: formData.payment_reference,
          card_last_four: formData.card_last_four,
          category: formData.category,
          notes: formData.notes,
          currency: formData.currency,
          image_url: imageUrl,
          source_file_name: storedFileName,
          source_file_type: storedFileType,
          integrity_hash: null,
          duplicate_hash,
          confidence_score: Number(formData.confidence_score ?? 0),
          cra_readiness_score: Number(formData.cra_readiness_score ?? 0),
          thermal_warning: formData.thermal_warning,
          capture_source: 'upload',
          usage_type: formData.usage_type,
          business_use_percent: Number(formData.business_use_percent ?? 100),
          job_code: formData.job_code,
          vehicle_id: formData.vehicle_id,
          line_items: formData.line_items,
        };

        const { error: insertErr } = await supabase.from('receipts').insert(payload);
        if (insertErr) throw insertErr;

        await insertAudit(
          'receipt_created_pdf',
          `Created PDF receipt ${payload.vendor_name} ${fmt$(payload.total_amount)} duplicate ${duplicate_hash.slice(0, 12)} App ${APP_VERSION}`,
        );
      } else {
        throw new Error('No file is attached.');
      }

      resetScanState();
      setPendingDuplicateSave(false);
      setDuplicateCandidate(null);
      onSaveSuccess();
      showToast('success', 'Receipt saved successfully.');
    } catch (e: any) {
      showToast('error', e?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const saveReceipt = async () => {
    if (!formData.vendor_name && !pdfFile) {
      showToast('error', 'Vendor name is required.');
      return;
    }
    if (!formData.transaction_date) {
      showToast('error', 'Transaction date is required.');
      return;
    }
    await executeSave();
  };

  const hasData = !!formData.vendor_name || Number(formData.total_amount) > 0 || formData.line_items.length > 0;
  const missingTaxNumber = !String(formData.business_number).trim() && Number(formData.tax_amount) > 0;
  const confidenceTone = getConfidenceTone(formData.confidence_score);
  const readinessTone = getReadinessTone(formData.cra_readiness_score);

  return (
    <div className="relative">
      {toast && <Toast toast={toast} />}

      <div className="grid lg:grid-cols-[420px,1fr] gap-4 items-start">
        <div className="space-y-4">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900">Capture</h2>
                <p className="text-xs text-slate-400 mt-0.5">Camera, upload, crop, then scan</p>
              </div>
              {(image || pdfPreviewName) && (
                <button onClick={resetScanState} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-red-500">
                  <RefreshCw size={16} />
                </button>
              )}
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => imageInputRef.current?.click()}
                  className="rounded-2xl border border-blue-100 bg-blue-50 hover:bg-blue-100 p-4 text-left transition-all"
                >
                  <Camera className="w-6 h-6 text-blue-500 mb-3" />
                  <p className="font-semibold text-slate-900">Camera Scan</p>
                  <p className="text-xs text-slate-400 mt-1">Native mobile capture</p>
                </button>

                <button
                  onClick={() => uploadInputRef.current?.click()}
                  className="rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 p-4 text-left transition-all"
                >
                  <Upload className="w-6 h-6 text-slate-600 mb-3" />
                  <p className="font-semibold text-slate-900">File Upload</p>
                  <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG</p>
                </button>
              </div>

              <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50" style={{ aspectRatio: '4 / 3' }}>
                {image ? (
                  <img src={image} alt="Receipt preview" className="w-full h-full object-contain" />
                ) : sourceFileType === 'pdf' && pdfPreviewName ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center p-6">
                    <FileText className="w-12 h-12 text-red-400 mb-3" />
                    <p className="font-semibold text-slate-900 break-all">{pdfPreviewName}</p>
                    <p className="text-xs text-slate-400 mt-1">Original PDF preserved for records vault</p>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100">
                      <Camera className="w-10 h-10 text-blue-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-700">Add a receipt to begin</p>
                      <p className="text-xs text-slate-400 mt-1">Images can be cropped manually before scan. PDFs are stored as originals.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2.5 bg-amber-50 rounded-xl px-4 py-3 border border-amber-100">
                <Thermometer size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Scan thermal receipts as soon as possible. Heat-sensitive print fades and may weaken audit support over time.
                </p>
              </div>

              {image && !scanning && (
                <button
                  onClick={processReceipt}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-blue-500/25 transition-all"
                >
                  <ScanLine size={20} />
                  Analyze with Gemini
                </button>
              )}
            </div>
          </div>

          {scanning && (
            <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center shadow-sm">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
              <p className="font-semibold text-slate-700">Extracting structured data</p>
              <p className="text-xs text-slate-400 mt-1">Vendor, taxes, line items, payment reference, confidence</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Review & Save</h3>
                <p className="text-xs text-slate-400 mt-0.5">Side-by-side verification and CRA-ready metadata</p>
              </div>
              <div className={`px-3 py-1.5 rounded-full border text-xs font-bold ${readinessTone}`}>
                CRA {Number(formData.cra_readiness_score ?? 0)}
              </div>
            </div>

            <div className="p-5 space-y-5">
              <div className={`rounded-xl border px-4 py-3 ${confidenceTone.panel}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Info size={14} className={confidenceTone.icon} />
                    <span className="text-xs font-bold uppercase tracking-wide">AI Confidence</span>
                  </div>
                  <span className="text-sm font-bold">{Number(formData.confidence_score ?? 0)}</span>
                </div>
                <p className="text-xs mt-1.5 leading-relaxed">
                  Verify vendor name, BN, totals, payment details, and line items before saving.
                </p>
              </div>

              {formData.thermal_warning && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <Thermometer size={14} className="text-orange-500 mt-0.5" />
                    <p className="text-xs text-orange-700">Thermal receipt risk detected. Keep the digital original and review field accuracy carefully.</p>
                  </div>
                </div>
              )}

              {formData.math_mismatch_warning && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle size={14} className="text-red-500 mt-0.5" />
                    <p className="text-xs text-red-700">Subtotal + tax does not equal total within rounding tolerance. Please verify the amounts.</p>
                  </div>
                </div>
              )}

              <Section title="Vendor">
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Vendor Name" icon={<Building2 size={13} className="text-slate-400" />}>
                    <input
                      type="text"
                      value={formData.vendor_name}
                      onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                      className={inputCls}
                    />
                  </Field>

                  <Field label="Business Number" icon={<Hash size={13} className="text-slate-400" />}>
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={formData.business_number}
                        onChange={(e) => setFormData({ ...formData, business_number: e.target.value })}
                        className={missingTaxNumber ? warningInputCls : inputCls}
                        placeholder="123456789RT0001"
                      />
                      {missingTaxNumber && <p className="text-xs text-yellow-700 font-medium">Missing GST/BN number while tax is claimed.</p>}
                    </div>
                  </Field>
                </div>

                <Field label="Vendor Address" icon={<FileImage size={13} className="text-slate-400" />}>
                  <input
                    type="text"
                    value={formData.vendor_address}
                    onChange={(e) => setFormData({ ...formData, vendor_address: e.target.value })}
                    className={inputCls}
                    placeholder="123 Main St, Calgary, AB"
                  />
                </Field>
              </Section>

              <Section title="Amounts">
                <div className="grid md:grid-cols-4 gap-3">
                  <Field label="Subtotal" icon={<DollarSign size={13} className="text-slate-400" />}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.subtotal}
                      onChange={(e) => setFormData({ ...formData, subtotal: parseFloat(e.target.value || '0') })}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="GST" icon={<DollarSign size={13} className="text-emerald-500" />}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.tax_amount}
                      onChange={(e) => setFormData({ ...formData, tax_amount: parseFloat(e.target.value || '0') })}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="PST/HST" icon={<DollarSign size={13} className="text-violet-500" />}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.pst_amount}
                      onChange={(e) => setFormData({ ...formData, pst_amount: parseFloat(e.target.value || '0') })}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Total" icon={<Wallet size={13} className="text-blue-500" />}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.total_amount}
                      onChange={(e) => setFormData({ ...formData, total_amount: parseFloat(e.target.value || '0') })}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Transaction">
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Date" icon={<CalendarDays size={13} className="text-slate-400" />}>
                    <input
                      type="date"
                      value={formData.transaction_date}
                      onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Time" icon={<Clock size={13} className="text-slate-400" />}>
                    <input
                      type="time"
                      value={formData.transaction_time}
                      onChange={(e) => setFormData({ ...formData, transaction_time: e.target.value })}
                      className={inputCls}
                    />
                  </Field>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="Category" icon={<Tag size={13} className="text-slate-400" />}>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className={`${inputCls} bg-white`}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Business Unit" icon={<Building2 size={13} className="text-slate-400" />}>
                    <select
                      value={formData.business_unit_id}
                      onChange={(e) => setFormData({ ...formData, business_unit_id: e.target.value })}
                      className={`${inputCls} bg-white`}
                    >
                      <option value="">Unassigned</option>
                      {businessUnits.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </Section>

              <Section title="Payment">
                <div className="grid md:grid-cols-3 gap-3">
                  <Field label="Method" icon={<CreditCard size={13} className="text-slate-400" />}>
                    <select
                      value={formData.payment_method}
                      onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                      className={`${inputCls} bg-white`}
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Card Last 4" icon={<CreditCard size={13} className="text-slate-400" />}>
                    <input
                      type="text"
                      maxLength={4}
                      value={formData.card_last_four}
                      onChange={(e) =>
                        setFormData({ ...formData, card_last_four: e.target.value.replace(/\D/g, '').slice(0, 4) })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Payment Reference" icon={<Hash size={13} className="text-slate-400" />}>
                    <input
                      type="text"
                      value={formData.payment_reference}
                      onChange={(e) => setFormData({ ...formData, payment_reference: e.target.value })}
                      className={inputCls}
                      placeholder="Auth code / approval code"
                    />
                  </Field>
                </div>
              </Section>

              <Section title="Construction & Use">
                <div className="grid md:grid-cols-3 gap-3">
                  <Field label="Job Code" icon={<Tag size={13} className="text-slate-400" />}>
                    <input
                      type="text"
                      value={formData.job_code}
                      onChange={(e) => setFormData({ ...formData, job_code: e.target.value })}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Vehicle ID" icon={<Receipt size={13} className="text-slate-400" />}>
                    <input
                      type="text"
                      value={formData.vehicle_id}
                      onChange={(e) => setFormData({ ...formData, vehicle_id: e.target.value })}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Usage Type" icon={<Tag size={13} className="text-slate-400" />}>
                    <select
                      value={formData.usage_type}
                      onChange={(e) => {
                        const next = e.target.value as 'business' | 'personal' | 'mixed';
                        setFormData({
                          ...formData,
                          usage_type: next,
                          business_use_percent: next === 'personal' ? 0 : formData.business_use_percent || 100,
                        });
                      }}
                      className={`${inputCls} bg-white`}
                    >
                      {USAGE_TYPES.map((u) => (
                        <option key={u} value={u}>
                          {u[0].toUpperCase() + u.slice(1)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Business Use %" icon={<Hash size={13} className="text-slate-400" />}>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={formData.business_use_percent}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        business_use_percent: Math.max(0, Math.min(100, parseInt(e.target.value || '0', 10))),
                        usage_type: Number(e.target.value || 0) === 0 ? 'personal' : formData.usage_type,
                      })
                    }
                    className={inputCls}
                  />
                </Field>
              </Section>

              <Section title="Line Items">
                <div className="space-y-3">
                  {formData.line_items.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
                      No line items extracted.
                    </div>
                  ) : (
                    formData.line_items.map((item, index) => (
                      <div key={index} className="grid md:grid-cols-[1fr,120px,140px,40px] gap-3 items-end">
                        <Field label={`Description ${index + 1}`} icon={<FileText size={13} className="text-slate-400" />}>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => {
                              const next = [...formData.line_items];
                              next[index] = { ...next[index], description: e.target.value };
                              setFormData({ ...formData, line_items: next });
                            }}
                            className={inputCls}
                          />
                        </Field>
                        <Field label="Qty" icon={<Hash size={13} className="text-slate-400" />}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => {
                              const next = [...formData.line_items];
                              next[index] = { ...next[index], quantity: parseFloat(e.target.value || '1') };
                              setFormData({ ...formData, line_items: next });
                            }}
                            className={inputCls}
                          />
                        </Field>
                        <Field label="Price" icon={<DollarSign size={13} className="text-slate-400" />}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.price}
                            onChange={(e) => {
                              const next = [...formData.line_items];
                              next[index] = { ...next[index], price: parseFloat(e.target.value || '0') };
                              setFormData({ ...formData, line_items: next });
                            }}
                            className={inputCls}
                          />
                        </Field>
                        <button
                          onClick={() => {
                            const next = formData.line_items.filter((_, i) => i !== index);
                            setFormData({ ...formData, line_items: next });
                          }}
                          className="h-11 rounded-xl border border-slate-200 hover:border-red-200 hover:bg-red-50 text-slate-500 hover:text-red-500 transition-all flex items-center justify-center"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))
                  )}

                  <button
                    onClick={() =>
                      setFormData({
                        ...formData,
                        line_items: [...formData.line_items, { description: '', quantity: 1, price: 0 }],
                      })
                    }
                    className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                  >
                    + Add line item
                  </button>
                </div>
              </Section>

              <Section title="Notes">
                <Field label="Business Purpose" icon={<FileText size={13} className="text-slate-400" />}>
                  <textarea
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className={`${inputCls} resize-none`}
                    placeholder="Describe the business purpose of this purchase"
                  />
                </Field>
              </Section>

              <div className="flex items-start gap-2.5 bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-100">
                <Fingerprint size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700 leading-relaxed">
                  A SHA-256 integrity hash will be computed for image uploads before storage and saved with the receipt record.
                </p>
              </div>

              <button
                onClick={saveReceipt}
                disabled={saving || (!image && sourceFileType !== 'pdf') || (!hasData && sourceFileType !== 'pdf')}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/25 transition-all"
              >
                {saving ? <Loader2 className="animate-spin w-5 h-5" /> : <ShieldCheck size={20} />}
                {saving ? 'Saving...' : 'Save to Audit Record'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleImageInput(e, 'camera')}
      />

      <input
        ref={uploadInputRef}
        type="file"
        accept=".pdf,image/png,image/jpeg,image/jpg"
        className="hidden"
        onChange={handleFileUpload}
      />

      {cropOpen && cropSource && (
        <ManualCropperModal
          imageSrc={cropSource}
          fileName={cropSourceName}
          onCancel={() => {
            setCropOpen(false);
            setCropSource(null);
          }}
          onApply={async (cropped) => {
            const resized = await resizeImageTo2000(cropped);
            resetScanState();
            setImage(resized);
            setSourceFileName(cropSourceName);
            setSourceFileType('image');
            setFormData((prev) => ({ ...prev, capture_source: cropSourceCapture }));
            setCropOpen(false);
            setCropSource(null);
            showToast('success', 'Image cropped and ready for scan.');
          }}
        />
      )}

      {duplicateCandidate && (
        <DuplicateModal
          candidate={duplicateCandidate}
          onCancel={() => {
            setDuplicateCandidate(null);
            setPendingDuplicateSave(false);
          }}
          onContinue={async () => {
            setDuplicateCandidate(null);
            setPendingDuplicateSave(true);
            await executeSave();
          }}
        />
      )}
    </div>
  );
}