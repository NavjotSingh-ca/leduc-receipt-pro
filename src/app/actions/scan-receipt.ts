'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ReceiptLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  line_total: number;
}

export interface ScannedReceiptData {
  vendor_name: string;
  vendor_address: string;
  business_number: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  pst_amount: number;
  card_last_four: string;
  transaction_date: string;
  transaction_time: string;
  payment_method: string;
  payment_reference: string;
  category: string;
  notes: string;
  confidence_score: number;
  cra_readiness_score: number;
  thermal_warning: boolean;
  document_type: 'receipt' | 'invoice' | 'statement' | 'unknown';
  duplicate_warning: boolean;
  duplicate_hash: string;
  math_mismatch_warning: boolean;
  missing_bn_warning: boolean;
  currency: string;
  line_items: ReceiptLineItem[];
}

interface ScanSuccess {
  success: true;
  data: ScannedReceiptData;
}

interface ScanFailure {
  success: false;
  error: string;
}

export type ScanReceiptResult = ScanSuccess | ScanFailure;

const CURRENT_YEAR = 2026;

/* ─── Alberta Construction Taxonomy ─── */
const VALID_CATEGORIES = [
  'Job Materials',
  'Subcontractors',
  'Site Fuel',
  'Equipment Rental',
  'Small Tools',
  'Vehicle Maintenance',
  'Travel/Lodging',
  'Office/Admin',
] as const;

type ValidCategory = (typeof VALID_CATEGORIES)[number];

const SMART_PURPOSE: Record<ValidCategory, string> = {
  'Job Materials': 'Construction materials purchased for active job site',
  'Subcontractors': 'Payment to subcontractor for contracted work on job site',
  'Site Fuel': 'Fuel purchased for equipment or vehicles used on construction site',
  'Equipment Rental': 'Equipment rental for construction project operations',
  'Small Tools': 'Small tools and consumables purchased for field operations',
  'Vehicle Maintenance': 'Vehicle maintenance and repair for company fleet',
  'Travel/Lodging': 'Business travel and lodging expense for remote job site work',
  'Office/Admin': 'Office and administrative expense supporting business operations',
};

const PROVINCE_TAX: Record<string, { gst: number; pst: number }> = {
  AB: { gst: 0.05, pst: 0.0 },
  BC: { gst: 0.05, pst: 0.07 },
  MB: { gst: 0.05, pst: 0.07 },
  SK: { gst: 0.05, pst: 0.06 },
  ON: { gst: 0.05, pst: 0.08 },
  QC: { gst: 0.05, pst: 0.09975 },
  NS: { gst: 0.05, pst: 0.1 },
  NB: { gst: 0.05, pst: 0.1 },
  NL: { gst: 0.05, pst: 0.1 },
  PE: { gst: 0.05, pst: 0.1 },
  NT: { gst: 0.05, pst: 0.0 },
  NU: { gst: 0.05, pst: 0.0 },
  YT: { gst: 0.05, pst: 0.0 },
};

function buildPrompt(): string {
  return `You are a Canadian receipt OCR expert. Analyze this receipt image and return a single JSON object (NO markdown fences, NO commentary) matching this exact schema:
{
  "vendor_name": "string",
  "vendor_address": "string (full address including city, province, postal code)",
  "vendor_tax_number": "string (GST/BN number e.g. 123456789RT0001, or empty string if none found)",
  "total_amount": 0.00,
  "subtotal": 0.00,
  "tax_amount": 0.00,
  "pst_amount": 0.00,
  "transaction_date": "YYYY-MM-DD",
  "transaction_time": "HH:MM",
  "payment_method": "Visa | Mastercard | Amex | Debit | Cash | E-Transfer | Cheque | Unknown",
  "card_last_four": "string (last 4 digits if visible)",
  "category": "${VALID_CATEGORIES.join(' | ')}",
  "currency": "CAD | USD | other",
  "confidence_score": 0 (your confidence 0-100 in extraction accuracy),
  "thermal_warning": false (true if receipt appears faded/thermal),
  "line_items": [
    {
      "description": "string",
      "quantity": 1,
      "unit_price": 0.00,
      "tax_amount": 0.00,
      "line_total": 0.00
    }
  ]
}

Rules:
- Extract EVERY line item visible on the receipt with description, quantity, unit_price, and line_total
- For Alberta vendors (no PST), set pst_amount to 0
- If the business number format matches ###-###-### RT ####, normalize to 9-digit+RT0001
- Dates must be YYYY-MM-DD. If year is ambiguous, assume ${CURRENT_YEAR}
- Return ONLY the JSON object, no other text`;
}

function prepareImage(raw: string): { data: string; mimeType: string } {
  const dataUri = raw.match(/^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([\s\S]+)$/i);

  if (dataUri) {
    return {
      mimeType: dataUri[1].toLowerCase().replace('jpg', 'jpeg'),
      data: dataUri[2].replace(/\s/g, ''),
    };
  }

  return {
    mimeType: 'image/jpeg',
    data: raw.replace(/\s/g, ''),
  };
}

function parseSafely(raw: string): Record<string, unknown> {
  const cleanFences = raw.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleanFences);
  } catch { /* continue */ }

  const start = cleanFences.indexOf('{');
  const end = cleanFences.lastIndexOf('}');
  
  if (start !== -1 && end > start) {
    let extracted = cleanFences.slice(start, end + 1);
    try {
      return JSON.parse(extracted);
    } catch { /* continue */ }

    extracted = extracted.replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(extracted);
    } catch { /* continue */ }

    extracted = extracted.replace(/\r?\n|\r/g, ' ');
    try {
      return JSON.parse(extracted);
    } catch { /* continue */ }
  }

  const preview = raw.length > 150 ? raw.slice(0, 150) + '...' : raw;
  throw new Error(`[Debug: ${preview}]`);
}

function toNum(v: unknown): number {
  const n = parseFloat(typeof v === 'string' ? v.replace(/[^0-9.-]/g, '') : String(v ?? ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function toStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function normalizeDate(raw: string): string {
  const s = raw.trim();

  if (!s) return `${CURRENT_YEAR}-04-11`;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const year = parseInt(s.slice(0, 4), 10);
    return `${year < 2024 ? CURRENT_YEAR : year}${s.slice(4)}`;
  }

  const mmdd = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (mmdd) {
    return `${CURRENT_YEAR}-${mmdd[1].padStart(2, '0')}-${mmdd[2].padStart(2, '0')}`;
  }

  const mdy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (mdy) {
    const year = parseInt(mdy[3], 10);
    return `${year < 2024 ? CURRENT_YEAR : year}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }

  const MONTH: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const written = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:[,\s]+(\d{4}))?$/i);
  if (written) {
    const mo = MONTH[written[1].slice(0, 3).toLowerCase()];
    if (mo) {
      const year = written[3] ? parseInt(written[3], 10) : CURRENT_YEAR;
      return `${year < 2024 ? CURRENT_YEAR : year}-${mo}-${written[2].padStart(2, '0')}`;
    }
  }

  return `${CURRENT_YEAR}-04-11`;
}

function normalizeTime(raw: string): string {
  const s = raw.trim();
  if (!s) return '';

  const t24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (t24) {
    const h = parseInt(t24[1], 10);
    const m = parseInt(t24[2], 10);
    if (h <= 23 && m <= 59) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const t12 = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (t12) {
    let h = parseInt(t12[1], 10);
    const m = parseInt(t12[2], 10);
    const isPm = t12[3].toLowerCase() === 'pm';
    if (isPm && h !== 12) h += 12;
    if (!isPm && h === 12) h = 0;
    if (h <= 23 && m <= 59) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return '';
}

function normalizeCard(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '';
}

function normalizePaymentReference(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';

  const match = cleaned.match(/[A-Z0-9-]{4,}/i);
  return match ? match[0].toUpperCase() : cleaned.slice(0, 40);
}

function detectProvince(address: string): string {
  const up = address.toUpperCase();

  for (const code of Object.keys(PROVINCE_TAX)) {
    if (new RegExp(`(?:^|[^A-Z])${code}(?:[^A-Z]|$)`).test(up)) return code;
  }

  const names: Record<string, string> = {
    ALBERTA: 'AB',
    'BRITISH COLUMBIA': 'BC',
    ONTARIO: 'ON',
    QUEBEC: 'QC',
    SASKATCHEWAN: 'SK',
    MANITOBA: 'MB',
    'NOVA SCOTIA': 'NS',
    'NEW BRUNSWICK': 'NB',
    NEWFOUNDLAND: 'NL',
    'PRINCE EDWARD ISLAND': 'PE',
    'NORTHWEST TERRITORIES': 'NT',
    NUNAVUT: 'NU',
    YUKON: 'YT',
  };

  for (const [name, code] of Object.entries(names)) {
    if (up.includes(name)) return code;
  }

  return 'AB';
}

interface RawAmounts {
  total: number;
  subtotal: number;
  gst: number;
  pst: number;
}

function reconcileTaxes(
  raw: RawAmounts,
  address: string,
): { subtotal: number; tax_amount: number; pst_amount: number; total_amount: number } {
  let { total, subtotal, gst, pst } = raw;
  const province = detectProvince(address);
  const rates = PROVINCE_TAX[province] ?? PROVINCE_TAX.AB;

  if (subtotal > 0 && gst === 0 && pst === 0 && total > 0) {
    const combined = Math.max(0, Math.round((total - subtotal) * 100) / 100);
    if (combined > 0) {
      if (rates.pst > 0) {
        const gstRatio = rates.gst / (rates.gst + rates.pst);
        gst = Math.round(combined * gstRatio * 100) / 100;
        pst = Math.round((combined - gst) * 100) / 100;
      } else {
        gst = combined;
        pst = 0;
      }
    }
  }

  if (subtotal > 0 && gst === 0 && pst === 0) {
    gst = Math.round(subtotal * rates.gst * 100) / 100;
    pst = Math.round(subtotal * rates.pst * 100) / 100;
  }

  if (total > 0 && subtotal === 0 && gst === 0 && pst === 0) {
    const divisor = 1 + rates.gst + rates.pst;
    subtotal = Math.round((total / divisor) * 100) / 100;
    gst = Math.round(subtotal * rates.gst * 100) / 100;
    pst = Math.round(subtotal * rates.pst * 100) / 100;
  }

  if (subtotal === 0 && total > 0) {
    subtotal = Math.max(0, Math.round((total - gst - pst) * 100) / 100);
  }

  const total_amount = Math.round((subtotal + gst + pst) * 100) / 100 || total;

  return {
    subtotal: Math.max(0, subtotal),
    tax_amount: Math.max(0, gst),
    pst_amount: Math.max(0, pst),
    total_amount: Math.max(0, total_amount),
  };
}

function normalizeLineItems(value: unknown): ReceiptLineItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const obj = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
      const description = toStr(obj.description);
      const quantity = toNum(obj.quantity || 1);
      const unit_price = toNum(obj.unit_price ?? obj.price);
      const tax_amount = toNum(obj.tax_amount);
      const line_total = toNum(obj.line_total) || Math.round(quantity * unit_price * 100) / 100;

      return { description, quantity: quantity > 0 ? quantity : 1, unit_price, tax_amount, line_total };
    })
    .filter((item) => item.description && item.unit_price >= 0);
}

function computeReadinessScore(input: {
  vendor_name: string;
  vendor_address: string;
  business_number: string;
  transaction_date: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  payment_method: string;
  payment_reference: string;
  notes: string;
  line_items: ReceiptLineItem[];
  math_mismatch_warning: boolean;
}): number {
  let score = 0;

  if (input.vendor_name) score += 15;
  if (input.vendor_address) score += 8;
  if (input.business_number) score += 18;
  if (input.transaction_date) score += 12;
  if (input.total_amount > 0) score += 12;
  if (input.subtotal > 0) score += 8;
  if (input.tax_amount >= 0) score += 7;
  if (input.payment_method && input.payment_method !== 'Unknown') score += 5;
  if (input.payment_reference) score += 4;
  if (input.notes.split(/\s+/).filter(Boolean).length >= 8) score += 5;
  if (input.line_items.length > 0) score += 6;

  if (input.math_mismatch_warning) score -= 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function computeConfidenceScore(options: {
  modelConfidence: number;
  hasBNPattern: boolean;
  modelTotal: number;
  sanitized: {
    total_amount: number;
    vendor_name: string;
    transaction_date: string;
    vendor_address: string;
    payment_reference: string;
  };
  thermal_warning: boolean;
  line_items: ReceiptLineItem[];
  math_mismatch_warning: boolean;
}): number {
  let score = Number.isFinite(options.modelConfidence) ? Math.round(options.modelConfidence) : 85;

  if (!options.hasBNPattern) score -= 18;
  if (options.modelTotal <= 0) score -= 15;
  if (options.sanitized.total_amount <= 0) score -= 12;
  if (!options.sanitized.vendor_name || options.sanitized.vendor_name === 'Unknown Vendor') score -= 6;
  if (!options.sanitized.transaction_date) score -= 6;
  if (!options.sanitized.vendor_address) score -= 5;
  if (!options.sanitized.payment_reference) score -= 2;
  if (options.thermal_warning) score -= 10;
  if (options.line_items.length === 0) score -= 4;
  if (options.math_mismatch_warning) score -= 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function sanitize(raw: Record<string, unknown>): ScannedReceiptData {
  const vendor_name = toStr(raw.vendor_name) || 'Unknown Vendor';
  const vendor_address = toStr(raw.vendor_address);
  const business_number_raw = toStr(raw.vendor_tax_number || raw.business_number).replace(/[\s-]/g, '');
  const hasBNPattern = /^\d{9}RT0001$/i.test(business_number_raw);
  const business_number = hasBNPattern ? business_number_raw.toUpperCase() : business_number_raw;

  const rawCategory = toStr(raw.category);
  const category: ValidCategory = VALID_CATEGORIES.includes(rawCategory as ValidCategory)
    ? (rawCategory as ValidCategory)
    : 'Office/Admin';

  const rawNotes = toStr(raw.notes);
  const notes = rawNotes.split(/\s+/).filter(Boolean).length >= 8 ? rawNotes : SMART_PURPOSE[category];

  const { subtotal, tax_amount, pst_amount, total_amount } = reconcileTaxes(
    {
      total: toNum(raw.total_amount),
      subtotal: toNum(raw.subtotal),
      gst: toNum(raw.tax_amount),
      pst: toNum(raw.pst_amount),
    },
    vendor_address,
  );

  const transaction_date = normalizeDate(toStr(raw.transaction_date));
  const transaction_time = normalizeTime(toStr(raw.transaction_time));
  const card_last_four = normalizeCard(toStr(raw.card_last_four));
  const payment_reference = normalizePaymentReference(toStr(raw.payment_reference));

  const payment_method_input = toStr(raw.payment_method);
  const payment_method =
    ['Visa', 'Mastercard', 'Amex', 'Debit', 'Cash', 'E-Transfer', 'Cheque'].includes(payment_method_input)
      ? payment_method_input
      : 'Unknown';

  const thermal_warning = Boolean(raw.thermal_warning);
  const document_type_raw = toStr(raw.document_type).toLowerCase();
  const document_type: ScannedReceiptData['document_type'] =
    document_type_raw === 'receipt' || document_type_raw === 'invoice' || document_type_raw === 'statement'
      ? (document_type_raw as ScannedReceiptData['document_type'])
      : 'unknown';

  const duplicate_warning = Boolean(raw.duplicate_warning);
  const line_items = normalizeLineItems(raw.line_items);
  const math_mismatch_warning = Math.abs((subtotal + tax_amount + pst_amount) - total_amount) > 0.02;
  const missing_bn_warning = !business_number && tax_amount > 0;

  const currency = toStr(raw.currency) || 'CAD';

  const confidence_score = computeConfidenceScore({
    modelConfidence: toNum(raw.confidence_score),
    hasBNPattern,
    modelTotal: toNum(raw.total_amount),
    sanitized: {
      total_amount,
      vendor_name,
      transaction_date,
      vendor_address,
      payment_reference,
    },
    thermal_warning,
    line_items,
    math_mismatch_warning,
  });

  const cra_readiness_score = computeReadinessScore({
    vendor_name,
    vendor_address,
    business_number,
    transaction_date,
    total_amount,
    subtotal,
    tax_amount,
    payment_method,
    payment_reference,
    notes,
    line_items,
    math_mismatch_warning,
  });

  const duplicate_hash = '';

  return {
    vendor_name,
    vendor_address,
    business_number,
    total_amount,
    subtotal,
    tax_amount,
    pst_amount,
    card_last_four,
    transaction_date,
    transaction_time,
    payment_method,
    payment_reference,
    category,
    notes,
    currency,
    confidence_score,
    cra_readiness_score,
    thermal_warning,
    document_type,
    duplicate_warning,
    duplicate_hash,
    math_mismatch_warning,
    missing_bn_warning,
    line_items,
  };
}

function is429RateLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('429') ||
    m.includes('resource_exhausted') ||
    m.includes('rate limit') ||
    m.includes('too many requests') ||
    m.includes('quota')
  );
}

export async function scanReceipt(base64Image: string): Promise<ScanReceiptResult> {
  if (!process.env.GOOGLE_AI_KEY) {
    return {
      success: false,
      error: 'AI service not configured. Add GOOGLE_AI_KEY to your environment.',
    };
  }

  if (!base64Image || base64Image.length < 500) {
    return {
      success: false,
      error: 'Image data is missing or too small. Please retake the photo.',
    };
  }

  let imagePayload: { data: string; mimeType: string };

  try {
    imagePayload = prepareImage(base64Image);
  } catch {
    return {
      success: false,
      error: 'Could not decode image data. Please try again.',
    };
  }

  if (imagePayload.data.length < 100) {
    return {
      success: false,
      error: 'Image appears empty after processing. Please retake it.',
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.05,
        topP: 0.8,
        maxOutputTokens: 3000,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent([
      buildPrompt(),
      {
        inlineData: {
          data: imagePayload.data,
          mimeType: imagePayload.mimeType,
        },
      },
    ]);

    const rawText = result.response.text().trim();

    if (!rawText) {
      return {
        success: false,
        error: 'AI returned an empty response. Please try again.',
      };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = parseSafely(rawText);
    } catch (err) {
      const debugMsg = err instanceof Error ? err.message : '';
      return {
        success: false,
        error: `AI response was messy. Please try clicking Analyze again. ${debugMsg}`,
      };
    }

    return {
      success: true,
      data: sanitize(parsed),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (is429RateLimitError(msg)) {
      return {
        success: false,
        error: 'The AI scanner is temporarily rate-limited right now. Please wait a moment and try again.',
      };
    }

    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      return {
        success: false,
        error: 'Invalid Google AI key. Check GOOGLE_AI_KEY in your environment.',
      };
    }

    if (msg.includes('SAFETY')) {
      return {
        success: false,
        error: 'Image was blocked by the AI safety filter. Please retake a clearer receipt image.',
      };
    }

    if (msg.includes('DEADLINE_EXCEEDED') || msg.toLowerCase().includes('timeout')) {
      return {
        success: false,
        error: 'Receipt scan timed out. Please try again with a clearer or smaller image.',
      };
    }

    return {
      success: false,
      error: 'Receipt scan failed. Please try again.',
    };
  }
}