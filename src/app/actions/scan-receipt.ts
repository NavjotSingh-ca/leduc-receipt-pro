'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ScannedReceiptData {
  vendor_name: string;
  vendor_address: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;       // Federal GST only (5%)
  pst_amount: number;       // PST / HST provincial portion / QST — 0 in Alberta
  card_last_four: string;   // Exactly 4 digits or ""
  transaction_date: string; // YYYY-MM-DD
  transaction_time: string; // HH:MM 24-hour or ""
  category: string;
  notes: string;            // Smart Business Purpose
}

interface ScanResult { success: true;  data: ScannedReceiptData }
interface ScanError  { success: false; error: string }
export type ScanReceiptResult = ScanResult | ScanError;

// ── Constants ──────────────────────────────────────────────────────────────────
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
  'Fuel':                     'Fuel purchased for company vehicle used in business travel',
  'Meals & Entertainment':    'Business meal or client entertainment expense',
  'Office Supplies':          'Office supplies for business operations',
  'Travel':                   'Business travel and accommodation expense',
  'Professional Fees':        'Professional services supporting business operations',
  'Supplies':                 'Supplies required for business use',
  'Software & Subscriptions': 'Software or subscription license for business productivity',
  'Utilities':                'Utility expense for business premises',
  'General Expense':          'General business operating expense',
};

// Canadian provincial/territorial tax rates
const PROVINCE_TAX: Record<string, { gst: number; pst: number }> = {
  AB: { gst: 0.05, pst: 0.00 },
  BC: { gst: 0.05, pst: 0.07 },
  MB: { gst: 0.05, pst: 0.07 },
  SK: { gst: 0.05, pst: 0.06 },
  ON: { gst: 0.05, pst: 0.08 },   // HST 13% = 5% federal + 8% provincial
  QC: { gst: 0.05, pst: 0.09975 },
  NS: { gst: 0.05, pst: 0.10 },   // HST 15%
  NB: { gst: 0.05, pst: 0.10 },
  NL: { gst: 0.05, pst: 0.10 },
  PE: { gst: 0.05, pst: 0.10 },
  NT: { gst: 0.05, pst: 0.00 },
  NU: { gst: 0.05, pst: 0.00 },
  YT: { gst: 0.05, pst: 0.00 },
};

// ── Prompt builder ─────────────────────────────────────────────────────────────
function buildPrompt(): string {
  return `You are a senior Canadian CPA specializing in CRA-compliant expense management for businesses across all provinces.

Today is April 10, ${CURRENT_YEAR}. Use this to resolve any ambiguous or partial dates on the receipt.

Analyze the receipt image and return ONLY a single valid JSON object. No markdown, no code fences, no text before { or after }.

Required JSON schema — every field is mandatory:
{
  "vendor_name":       "string — business name exactly as printed on the receipt",
  "vendor_address":    "string — complete address from receipt, or empty string if absent",
  "total_amount":      number — grand total paid including all taxes,
  "subtotal":          number — pre-tax subtotal amount,
  "tax_amount":        number — federal GST amount only (always 5% of taxable subtotal),
  "pst_amount":        number — provincial tax only: PST, HST provincial component, QST, RST. Use 0 for Alberta/territories with no PST,
  "card_last_four":    "string — exactly 4 digits from masked card number (e.g. from ****1234 or XXXX-5678), or empty string if cash or not visible",
  "transaction_date":  "string — YYYY-MM-DD format",
  "transaction_time":  "string — HH:MM in 24-hour format, or empty string if not on receipt",
  "category":          "string — EXACTLY one of: ${VALID_CATEGORIES.join(' | ')}",
  "notes":             "string — specific CRA-audit-ready business purpose, minimum 8 words, mentioning vendor type and business activity"
}

RULE 1 — DATE RESOLUTION:
  If year is absent but month and day are present: use ${CURRENT_YEAR} as the year.
  "Apr 10" → "${CURRENT_YEAR}-04-10". "03/15" → "${CURRENT_YEAR}-03-15".
  Never output a year before 2024 unless it is explicitly printed on the receipt.
  If only month+year: use the 1st of that month.

RULE 2 — TAX SEPARATION BY PROVINCE (infer from vendor_address):
  Alberta / NWT / Nunavut / Yukon: GST 5% only — pst_amount = 0.
  British Columbia: GST 5% + PST 7%. Split into tax_amount and pst_amount.
  Ontario: HST 13% = 5% GST + 8% provincial. tax_amount = 5% portion, pst_amount = 8% portion.
  Nova Scotia / New Brunswick / Newfoundland / PEI: HST 15% = 5% + 10%. Split accordingly.
  Quebec: GST 5% + QST 9.975%. tax_amount = GST, pst_amount = QST.
  Saskatchewan: GST 5% + PST 6%. Manitoba: GST 5% + RST 7%.
  If only one combined "Tax" line exists with no breakdown: infer province from address and split mathematically.
  If province is undetectable and tax ≈ 5% of subtotal: treat as GST only, pst_amount = 0.

RULE 3 — PAYMENT & CARD DIGITS:
  Detect: VISA, MASTERCARD, MC, AMEX, AMERICAN EXPRESS, DEBIT, CASH on the receipt slip.
  card_last_four = the last 4 digits from a masked number like "XXXX XXXX XXXX 1234" or "****5678".
  If cash or no card number visible: card_last_four = "".

RULE 4 — AMOUNT INTEGRITY:
  All numbers: plain decimal ≥ 0 with exactly 2 decimal places (52.49 not "$52.49").
  total_amount = subtotal + tax_amount + pst_amount (±$0.02 rounding tolerance).
  If subtotal missing: subtotal = total_amount − tax_amount − pst_amount.
  If total missing: total_amount = subtotal + tax_amount + pst_amount.
  Never produce negative numbers.

RULE 5 — SMART BUSINESS PURPOSE:
  The notes field must be ≥ 8 words, specific enough to justify a CRA input tax credit.
  Examples:
    Fuel → "Fuel purchased at [vendor] for company vehicle used in client site visits"
    Meals → "Business lunch at [vendor] with client for project discussion"
    Office Supplies → "Printer toner and paper purchased at [vendor] for office operations"

OUTPUT: Return ONLY the JSON object. Nothing else.`.trim();
}

// ── Image preparation ──────────────────────────────────────────────────────────
/**
 * Accepts a full data URI (data:image/jpeg;base64,...) or raw base64.
 * Returns { data, mimeType } ready for Gemini inlineData.
 */
function prepareImage(raw: string): { data: string; mimeType: string } {
  const dataUri = raw.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([\s\S]+)$/);
  if (dataUri) {
    return {
      mimeType: dataUri[1],
      data:     dataUri[2].replace(/[\s]/g, ''),
    };
  }
  // Bare base64 string — assume JPEG (canvas default)
  return {
    mimeType: 'image/jpeg',
    data:     raw.replace(/[\s]/g, ''),
  };
}

// ── JSON extraction ────────────────────────────────────────────────────────────
/**
 * Strip markdown fences and extract the first complete {...} block.
 * Handles the rare case where the model adds prose despite instructions.
 */
function extractJSON(raw: string): string {
  let s = raw
    .replace(/^```(?:json)?[\r\n]*/im, '')
    .replace(/[\r\n]*```$/im, '')
    .trim();

  const start = s.indexOf('{');
  const end   = s.lastIndexOf('}');
  if (start !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }
  return s;
}

// ── Value coercers ─────────────────────────────────────────────────────────────
function toNum(v: unknown): number {
  const n = parseFloat(
    typeof v === 'string' ? v.replace(/[^0-9.-]/g, '') : String(v ?? '')
  );
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function toStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// ── Date normalizer ────────────────────────────────────────────────────────────
function normalizeDate(raw: string): string {
  const s = raw.trim();

  // Already correct: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const year = parseInt(s.slice(0, 4), 10);
    // Clamp clearly wrong years (model sometimes hallucinates 2019, 2023)
    if (year < 2024) return `${CURRENT_YEAR}${s.slice(4)}`;
    return s;
  }

  // MM/DD or M/D (North American short form without year)
  const mmdd = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (mmdd) {
    return `${CURRENT_YEAR}-${mmdd[1].padStart(2, '0')}-${mmdd[2].padStart(2, '0')}`;
  }

  // MM/DD/YYYY or MM-DD-YYYY
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdy) {
    const year = parseInt(mdy[3], 10);
    return `${year < 2024 ? CURRENT_YEAR : year}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }

  // "Apr 10" / "April 10" / "Apr 10, 2026"
  const MONTH: Record<string, string> = {
    jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
    jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
  };
  const written = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:[,\s]+(\d{4}))?$/i);
  if (written) {
    const mo = MONTH[written[1].slice(0, 3).toLowerCase()];
    if (mo) {
      const year = written[3] ? parseInt(written[3], 10) : CURRENT_YEAR;
      return `${year < 2024 ? CURRENT_YEAR : year}-${mo}-${written[2].padStart(2, '0')}`;
    }
  }

  // "2026-Apr-10" or "10-Apr-2026"
  const mixedDMY = s.match(/^(\d{1,2})-([a-z]{3})-(\d{4})$/i);
  if (mixedDMY) {
    const mo = MONTH[mixedDMY[2].toLowerCase()];
    if (mo) return `${mixedDMY[3]}-${mo}-${mixedDMY[1].padStart(2, '0')}`;
  }

  // Last resort: today
  return `${CURRENT_YEAR}-04-10`;
}

// ── Time normalizer ────────────────────────────────────────────────────────────
function normalizeTime(raw: string): string {
  const s = raw.trim();

  // HH:MM (24-h)
  const t24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (t24) {
    const h = parseInt(t24[1], 10), m = parseInt(t24[2], 10);
    if (h <= 23 && m <= 59) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  // H:MM AM/PM
  const t12 = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (t12) {
    let h = parseInt(t12[1], 10);
    const m = parseInt(t12[2], 10);
    const pm = t12[3].toLowerCase() === 'pm';
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    if (h <= 23 && m <= 59) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  return '';
}

// ── Card digit extractor ───────────────────────────────────────────────────────
function normalizeCard(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // The model may return full 16-digit number or last 4
  if (digits.length >= 4) return digits.slice(-4);
  return '';
}

// ── Province detector ──────────────────────────────────────────────────────────
function detectProvince(address: string): string {
  const up = address.toUpperCase();

  // Match 2-letter province codes with word boundaries
  for (const code of Object.keys(PROVINCE_TAX)) {
    if (new RegExp(`(?:^|[^A-Z])${code}(?:[^A-Z]|$)`).test(up)) return code;
  }

  // Full province names
  const names: Record<string, string> = {
    'ALBERTA': 'AB', 'BRITISH COLUMBIA': 'BC', 'ONTARIO': 'ON',
    'QUEBEC': 'QC', 'SASKATCHEWAN': 'SK', 'MANITOBA': 'MB',
    'NOVA SCOTIA': 'NS', 'NEW BRUNSWICK': 'NB', 'NEWFOUNDLAND': 'NL',
    'PRINCE EDWARD ISLAND': 'PE', 'NORTHWEST TERRITORIES': 'NT',
    'NUNAVUT': 'NU', 'YUKON': 'YT',
  };
  for (const [name, code] of Object.entries(names)) {
    if (up.includes(name)) return code;
  }

  return 'AB'; // Default: Alberta (where the business is based)
}

// ── Tax reconciliation ─────────────────────────────────────────────────────────
interface RawAmounts { total: number; subtotal: number; gst: number; pst: number }

function reconcileTaxes(
  raw: RawAmounts,
  address: string,
): { subtotal: number; tax_amount: number; pst_amount: number; total_amount: number } {

  let { total, subtotal, gst, pst } = raw;
  const province = detectProvince(address);
  const rates    = PROVINCE_TAX[province] ?? PROVINCE_TAX['AB'];

  // ── Case 1: subtotal known, taxes missing ────────────────────────────────────
  if (subtotal > 0 && gst === 0 && pst === 0) {
    gst = Math.round(subtotal * rates.gst * 100) / 100;
    pst = Math.round(subtotal * rates.pst * 100) / 100;
  }

  // ── Case 2: total + subtotal known, combined tax unknown ─────────────────────
  if (total > 0 && subtotal > 0 && gst === 0 && pst === 0) {
    const combined = Math.max(0, Math.round((total - subtotal) * 100) / 100);
    if (rates.pst > 0 && combined > 0) {
      const gstRatio = rates.gst / (rates.gst + rates.pst);
      gst = Math.round(combined * gstRatio * 100) / 100;
      pst = Math.round((combined - gst) * 100) / 100;
    } else {
      gst = combined;
      pst = 0;
    }
  }

  // ── Case 3: only total is known ──────────────────────────────────────────────
  if (total > 0 && subtotal === 0 && gst === 0 && pst === 0) {
    const divisor = 1 + rates.gst + rates.pst;
    subtotal = Math.round((total / divisor) * 100) / 100;
    gst      = Math.round(subtotal * rates.gst * 100) / 100;
    pst      = Math.round(subtotal * rates.pst * 100) / 100;
  }

  // ── Repair subtotal if still missing ─────────────────────────────────────────
  if (subtotal === 0 && total > 0) {
    subtotal = Math.max(0, Math.round((total - gst - pst) * 100) / 100);
  }

  // ── Compute authoritative total ───────────────────────────────────────────────
  const total_amount = Math.round((subtotal + gst + pst) * 100) / 100 || total;

  return {
    subtotal:     Math.max(0, subtotal),
    tax_amount:   Math.max(0, gst),
    pst_amount:   Math.max(0, pst),
    total_amount: Math.max(0, total_amount),
  };
}

// ── Full sanitizer ─────────────────────────────────────────────────────────────
function sanitize(raw: Record<string, unknown>): ScannedReceiptData {
  const vendor_name    = toStr(raw.vendor_name) || 'Unknown Vendor';
  const vendor_address = toStr(raw.vendor_address);

  const rawCategory = toStr(raw.category);
  const category: ValidCategory = VALID_CATEGORIES.includes(rawCategory as ValidCategory)
    ? (rawCategory as ValidCategory)
    : 'General Expense';

  const rawNotes = toStr(raw.notes);
  const notes = rawNotes.split(/\s+/).length >= 8 ? rawNotes : SMART_PURPOSE[category];

  const { subtotal, tax_amount, pst_amount, total_amount } = reconcileTaxes(
    {
      total:    toNum(raw.total_amount),
      subtotal: toNum(raw.subtotal),
      gst:      toNum(raw.tax_amount),
      pst:      toNum(raw.pst_amount),
    },
    vendor_address,
  );

  return {
    vendor_name,
    vendor_address,
    total_amount,
    subtotal,
    tax_amount,
    pst_amount,
    card_last_four:   normalizeCard(toStr(raw.card_last_four)),
    transaction_date: normalizeDate(toStr(raw.transaction_date)),
    transaction_time: normalizeTime(toStr(raw.transaction_time)),
    category,
    notes,
  };
}

// ── Main export ────────────────────────────────────────────────────────────────
export async function scanReceipt(base64Image: string): Promise<ScanReceiptResult> {

  // ── Env guard ────────────────────────────────────────────────────────────────
  if (!process.env.GOOGLE_AI_KEY) {
    return { success: false, error: 'AI service not configured. Add GOOGLE_AI_KEY to .env.local.' };
  }

  // ── Input validation ─────────────────────────────────────────────────────────
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
    return { success: false, error: 'Image appears to be empty after processing. Please retake.' };
  }

  // ── Gemini API call ──────────────────────────────────────────────────────────
  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature:      0.05,  // Near-deterministic — critical for financial data
        topP:             0.8,
        maxOutputTokens:  1024,
        responseMimeType: 'application/json', // Forces raw JSON; suppresses markdown fences
      },
    });

    const result  = await model.generateContent([
      buildPrompt(),
      { inlineData: { data: imagePayload.data, mimeType: imagePayload.mimeType } },
    ]);

    const rawText = result.response.text().trim();

    if (!rawText) {
      return { success: false, error: 'AI returned an empty response. Please try again.' };
    }

    // ── Parse ────────────────────────────────────────────────────────────────
    const jsonString = extractJSON(rawText);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      console.error('[scanReceipt] JSON.parse failed. Model output was:\n', rawText);
      return {
        success: false,
        error: 'Could not read the AI response. Ensure the receipt is in focus and well-lit.',
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
      return { success: false, error: 'Request timed out — image may be too large. Retake the photo.' };
    }

    console.error('[scanReceipt] Unhandled error:', msg);
    return { success: false, error: 'Receipt scan failed. Check server logs for details.' };
  }
}