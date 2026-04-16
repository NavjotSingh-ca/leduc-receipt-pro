export type CaptureSource = 'camera' | 'upload' | 'email' | 'bulk-import' | 'accountant-import';
export type UsageType = 'business' | 'personal' | 'mixed';
export type DocumentType = 'receipt' | 'invoice' | 'statement' | 'unknown';
export type SourceFileType = 'image' | 'pdf' | 'heic' | 'png' | 'jpg' | 'jpeg' | '';

export type ToastType = 'success' | 'error' | 'info';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BusinessUnit {
  id: string;
  name: string;
}

export interface ReceiptLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount: number;
  category: string;
  line_total: number;
}

export interface ReceiptForm {
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
  document_type: DocumentType;

  duplicate_warning: boolean;
  duplicate_hash: string;
  math_mismatch_warning: boolean;
  missing_bn_warning: boolean;

  capture_source: CaptureSource;
  usage_type: UsageType;
  business_use_percent: number;

  job_code: string;
  vehicle_id: string;
  business_unit_id: string;

  line_items: ReceiptLineItem[];
}

export interface ReceiptRow {
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
  source_file_type?: SourceFileType | string | null;

  integrity_hash?: string | null;
  duplicate_hash?: string | null;

  confidence_score?: number | null;
  cra_readiness_score?: number | null;

  thermal_warning?: boolean | null;
  capture_source?: CaptureSource | string | null;
  usage_type?: UsageType | null;
  business_use_percent?: number | null;

  job_code?: string | null;
  vehicle_id?: string | null;

  line_items?: ReceiptLineItem[] | null;

  created_at?: string | null;
  updated_at?: string | null;
}

export interface ScannerProps {
  user: any;
  onSaveSuccess: () => void;
}

export interface ScannerFormProps {
  formData: ReceiptForm;
  setFormData: (data: ReceiptForm) => void;
  businessUnits: BusinessUnit[];
  saving: boolean;
  onSave: () => void;
  hasAnalyzed?: boolean;
}

export interface ManualCropperProps {
  imageSrc: string;
  fileName: string;
  onCancel: () => void;
  onApply: (croppedDataUrl: string) => void;
}

export interface DuplicateModalProps {
  candidate: ReceiptRow;
  onCancel: () => void;
  onContinue: () => void;
}

export const CATEGORIES = [
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

export const PAYMENT_METHODS = [
  'Visa',
  'Mastercard',
  'Amex',
  'Debit',
  'Cash',
  'E-Transfer',
  'Cheque',
  'Unknown',
] as const;

export const USAGE_TYPES = ['business', 'personal', 'mixed'] as const;

export const DOCUMENT_TYPES = ['receipt', 'invoice', 'statement', 'unknown'] as const;

export const DEFAULT_CURRENCY = 'CAD';

export const todayISO = (): string => new Date().toISOString().split('T')[0];

export function createBlankReceiptLineItem(): ReceiptLineItem {
  return {
    description: '',
    quantity: 1,
    unit_price: 0,
    tax_rate: 0,
    tax_amount: 0,
    category: '',
    line_total: 0,
  };
}

export function createBlankReceiptForm(): ReceiptForm {
  return {
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
    currency: DEFAULT_CURRENCY,

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
}