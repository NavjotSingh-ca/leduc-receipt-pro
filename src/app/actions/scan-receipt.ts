'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

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
  category: string;
  notes: string;
  confidence_score: number;
  cra_readiness_score: number;
  thermal_warning: boolean;
  document_type: 'receipt' | 'invoice' | 'statement' | 'unknown';
  duplicate_warning: boolean;
  math_mismatch_warning: boolean;
  missing_bn_warning: boolean;
}

interface ScanResult {
  success: true;
  data: ScannedReceiptData;
}

interface ScanError {
  success: false;
  error: string;
}

export type ScanReceiptResult = ScanResult | ScanError;

const CURRENT_YEAR = 2026;

const VALID_CATEGORIES = [
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

type ValidCategory = (typeof VALID_CATEGORIES)[number];

const SMART_PURPOSE: Record<ValidCategory, string> = {
  Fuel: 'Fuel purchased for company vehicle used in business travel',
  'Meals & Entertainment': 'Business meal or client entertainment expense',
  'Office Supplies': 'Office supplies for business operations',
  Travel: 'Business travel and accommodation expense',
  'Professional Fees': 'Professional services supporting business operations',
  Supplies: 'Supplies required for business use',
  'Software & Subscriptions': 'Software or subscription license for business productivity',
  Utilities: 'Utility expense for business premises',
  'General Expense': 'General business operating expense',
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
  return `You are a senior Canadian CPA specializing in CRA-compliant expense management for businesses across all provinces.

Today is April 11, ${CURRENT_YEAR}. Use this to resolve ambiguous or partial dates on the receipt.

Analyze the receipt image and return ONLY one valid JSON object. No markdown. No code fences. No prose.

Required JSON schema:
{
  "vendor_name": "string",
  "vendor_address": "string",
  "business_number": "string",
  "total_amount": 0,
  "subtotal": 0,
  "tax_amount": 0,
  "pst_amount": 0,
  "card_last_four": "string",
  "transaction_date": "YYYY-MM-DD",
  "transaction_time": "HH:MM",
  "payment_method": "Visa | Mastercard | Amex | Debit | Cash | E-Transfer | Cheque | Unknown",
  "category": "${VALID_CATEGORIES.join(' | ')}",
  "notes": "minimum 8 words, CRA-audit-ready business purpose",
  "confidence_score": 0,
  "thermal_warning": false,
  "document_type": "receipt | invoice | statement | unknown",
  "duplicate_warning": false
}

Rules:
1. Search the ENTIRE image carefully for business name, address, BN/GST number, total, subtotal, GST, PST/HST/QST, date, time, payment method, and last 4 digits.
2. business_number must be a CRA GST/BN pattern like 123456789RT0001. If absent, return "".
3. For Alberta, GST is 5% and PST is always 0.00.
4. Ontario HST 13% must be split as 5% federal + 8% provincial.
5. Atlantic HST 15% must be split as 5% federal + 10% provincial.
6. Quebec QST must go into pst_amount.
7. If only a combined tax line exists, infer split from the province in the vendor address.
8. If subtotal is missing but total and tax are visible, infer subtotal.
9. If total is missing but subtotal and taxes are visible, infer total.
10. payment_method must be inferred from the receipt if visible.
11. card_last_four must be the last 4 visible digits or "".
12. thermal_warning should be true if the receipt appears to be on faint thermal paper, low contrast, faded, washed out, or otherwise likely to degrade.
13. confidence_score should be lower when BN is missing, totals are uncertain, or the image is poor.
14. category must be exactly one of the allowed categories.
15. notes must be specific and useful for CRA review.

Return only the JSON object.`.trim();
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

function extractJSON(raw: string): string {
  let s = raw
    .replace(/^```(?:json)?[\r\n]*/im, '')
    .replace(/[\r\n]*```$/im, '')
    .trim();

  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }
  return s;
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
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
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

function computeReadinessScore(input: {
  vendor_name: string;
  vendor_address: string;
  business_number: string;
  transaction_date: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  payment_method: string;
  notes: string;
  math_mismatch_warning: boolean;
}): number {
  let score = 0;

  if (input.vendor_name) score += 18;
  if (input.vendor_address) score += 10;
  if (input.business_number) score += 18;
  if (input.transaction_date) score += 12;
  if (input.total_amount > 0) score += 14;
  if (input.subtotal > 0) score += 8;
  if (input.tax_amount >= 0) score += 8;
  if (input.payment_method && input.payment_method !== 'Unknown') score += 6;
  if (input.notes.split(/\s+/).filter(Boolean).length >= 8) score += 6;

  if (input.math_mismatch_warning) score -= 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function computeConfidenceScore(options: {
  hasBNPattern: boolean;
  modelTotal: number;
  sanitized: {
    total_amount: number;
    vendor_name: string;
    transaction_date: string;
    vendor_address: string;
  };
  thermal_warning: boolean;
  math_mismatch_warning: boolean;
}): number {
  let score = 100;

  if (!options.hasBNPattern) score -= 35;
  if (options.modelTotal <= 0) score -= 20;
  if (options.sanitized.total_amount <= 0) score -= 15;
  if (!options.sanitized.vendor_name || options.sanitized.vendor_name === 'Unknown Vendor') score -= 8;
  if (!options.sanitized.transaction_date) score -= 8;
  if (!options.sanitized.vendor_address) score -= 6;
  if (options.thermal_warning) score -= 8;
  if (options.math_mismatch_warning) score -= 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function sanitize(raw: Record<string, unknown>): ScannedReceiptData {
  const vendor_name = toStr(raw.vendor_name) || 'Unknown Vendor';
  const vendor_address = toStr(raw.vendor_address);
  const business_number_raw = toStr(raw.business_number).replace(/[\s-]/g, '');
  const hasBNPattern = /^\d{9}RT0001$/i.test(business_number_raw);
  const business_number = hasBNPattern ? business_number_raw.toUpperCase() : '';

  const rawCategory = toStr(raw.category);
  const category: ValidCategory = VALID_CATEGORIES.includes(rawCategory as ValidCategory)
    ? (rawCategory as ValidCategory)
    : 'General Expense';

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

  const payment_method_input = toStr(raw.payment_method);
  const payment_method = (
    ['Visa', 'Mastercard', 'Amex', 'Debit', 'Cash', 'E-Transfer', 'Cheque'].includes(payment_method_input)
      ? payment_method_input
      : 'Unknown'
  ) as ScannedReceiptData['payment_method'];

  const thermal_warning = Boolean(raw.thermal_warning);
  const document_type_raw = toStr(raw.document_type).toLowerCase();
  const document_type: ScannedReceiptData['document_type'] =
    document_type_raw === 'receipt' ||
    document_type_raw === 'invoice' ||
    document_type_raw === 'statement'
      ? (document_type_raw as ScannedReceiptData['document_type'])
      : 'unknown';

  const duplicate_warning = Boolean(raw.duplicate_warning);
  const math_mismatch_warning = Math.abs((subtotal + tax_amount + pst_amount) - total_amount) > 0.02;
  const missing_bn_warning = !business_number && tax_amount > 0;

  const confidence_score = computeConfidenceScore({
    hasBNPattern,
    modelTotal: toNum(raw.total_amount),
    sanitized: {
      total_amount,
      vendor_name,
      transaction_date,
      vendor_address,
    },
    thermal_warning,
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
    notes,
    math_mismatch_warning,
  });

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
    category,
    notes,
    confidence_score,
    cra_readiness_score,
    thermal_warning,
    document_type,
    duplicate_warning,
    math_mismatch_warning,
    missing_bn_warning,
  };
}

export async function scanReceipt(base64Image: string): Promise<ScanReceiptResult> {
  if (!process.env.GOOGLE_AI_KEY) {
    return { success: false, error: 'AI service not configured. Add GOOGLE_AI_KEY to .env.local.' };
  }

  if (!base64Image || base64Image.length < 500) {
    return { success: false, error: 'Image data is too small or missing. Please retake the photo.' };
  }

  let imagePayload: { data: string; mimeType: string };

  try {
    imagePayload = prepareImage(base64Image);
  } catch {
    return { success: false, error: 'Could not decode image data. Please try again.' };
  }

  if (imagePayload.data.length < 100) {
    return { success: false, error: 'Image appears to be empty after processing. Please retake it.' };
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.05,
        topP: 0.8,
        maxOutputTokens: 1400,
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
      return { success: false, error: 'AI returned an empty response. Please try again.' };
    }

    const jsonString = extractJSON(rawText);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      console.error('[scanReceipt] JSON.parse failed. Raw model output:\n', rawText);
      return {
        success: false,
        error: 'Could not parse the AI response. Ensure the receipt is in focus and well lit.',
      };
    }

    return { success: true, data: sanitize(parsed) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      return { success: false, error: 'Invalid Google AI key. Check GOOGLE_AI_KEY in .env.local.' };
    }

    if (msg.includes('RESOURCE_EXHAUSTED') || msg.toLowerCase().includes('quota')) {
      return { success: false, error: 'AI quota exceeded. Please wait and try again.' };
    }

    if (msg.includes('SAFETY')) {
      return { success: false, error: 'Image flagged by safety filter. Try a clearer receipt photo.' };
    }

    if (msg.includes('DEADLINE_EXCEEDED') || msg.toLowerCase().includes('timeout')) {
      return { success: false, error: 'Request timed out. The image may be too large or unclear.' };
    }

    console.error('[scanReceipt] Unhandled error:', msg);
    return { success: false, error: 'Receipt scan failed. Check server logs for details.' };
  }
}