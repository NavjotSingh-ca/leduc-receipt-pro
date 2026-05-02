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
  fraud_suspicion: boolean;
  fraud_reason: string;
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

function buildPrompt(captureSource: string = 'camera'): string {
  let contextPrompt = '';
  if (captureSource === 'email_screenshot') {
    contextPrompt = `
CONTEXT: This is a DIGITAL EMAIL SCREENSHOT.
- Prioritize extracting digital invoice numbers, order IDs, and vendor contact emails.
- Extract the vendor name exactly as it appears in the header or "From" field.
- Digital receipts often have clearer metadata than paper ones.`;
  }

  return `You are an elite Canadian receipt API with built-in fraud and anomaly detection. 
Analyze this document image and return a single JSON object matching this exact schema:
{
  "vendor_name": "string",
  "vendor_address": "full address including city, province, postal code",
  "vendor_tax_number": "GST/BN number e.g. 123456789RT0001, or empty string",
  "total_amount": 0.00,
  "subtotal": 0.00,
  "tax_amount": 0.00,
  "pst_amount": 0.00,
  "transaction_date": "YYYY-MM-DD",
  "transaction_time": "HH:MM",
  "payment_method": "Visa | Mastercard | Amex | Debit | Cash | E-Transfer | Cheque | Unknown",
  "card_last_four": "last 4 digits if visible",
  "category": "${VALID_CATEGORIES.join(' | ')}",
  "currency": "CAD | USD | other",
  "confidence_score": 0 (confidence 0-100),
  "thermal_warning": false (true if receipt is faded/thermal),
  "fraud_suspicion": false (true if out of policy, weird vendor, impossible math, or AI fake),
  "fraud_reason": "string (explain why if fraud_suspicion is true, else empty)",
  "document_type": "Receipt | Invoice | Estimate | Statement",
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

${contextPrompt}

Rules:
- Extract EVERY line item visible.
- If tax amounts are physically printed wrong or subtotal+tax != total, flag it.
- For Alberta vendors (no PST), set pst_amount to 0.
- If you suspect this is an AI-generated fake receipt (perfect fonts, metadata anomalies), set fraud_suspicion=true.
- Dates must be YYYY-MM-DD. Assume ${CURRENT_YEAR} if ambiguous.
- RETURN ONLY THE JSON OBJECT. No markdown, no fences.`;
}

function preparePayload(raw: string): { data: string; mimeType: string } {
  // Support both images AND PDFs
  const dataUri = raw.match(/^data:((?:image\/(?:jpeg|jpg|png|webp|gif))|(?:application\/pdf));base64,([\s\S]+)$/i);
  if (dataUri) {
    const mime = dataUri[1].toLowerCase().replace('image/jpg', 'image/jpeg');
    return { mimeType: mime, data: dataUri[2].replace(/\s/g, '') };
  }
  return { mimeType: 'image/jpeg', data: raw.replace(/\s/g, '') };
}

function parseSafely(raw: string): Record<string, unknown> {
  const cleanFences = raw.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleanFences); } catch { /* continue */ }

  const start = cleanFences.indexOf('{');
  const end = cleanFences.lastIndexOf('}');
  
  if (start !== -1 && end > start) {
    let extracted = cleanFences.slice(start, end + 1);
    try { return JSON.parse(extracted); } catch { /* continue */ }
    extracted = extracted.replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(extracted); } catch { /* continue */ }
    extracted = extracted.replace(/\r?\n|\r/g, ' ');
    try { return JSON.parse(extracted); } catch { /* throw below */ }
  }
  throw new Error(`[Debug: failed to parse JSON]`);
}

function toNum(v: unknown): number {
  const n = parseFloat(typeof v === 'string' ? v.replace(/[^0-9.-]/g, '') : String(v ?? ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function toStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function normalizeDate(raw: string): string {
  const s = raw.trim();
  if (!s) return todayISO();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  
  // Try common Canadian formats (MM/DD/YYYY or DD/MM/YYYY)
  const mdy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  
  const longDate = new Date(s);
  if (!isNaN(longDate.getTime())) return longDate.toISOString().split('T')[0];
  
  return todayISO();
}

/** Detect province from vendor address and validate tax rates */
function validateProvinceTax(
  vendor_address: string,
  subtotal: number,
  tax_amount: number,
  pst_amount: number
): { province: string | null; tax_warning: string | null } {
  const addr = vendor_address.toUpperCase();
  const provinceMatch = addr.match(
    /\b(AB|BC|MB|SK|ON|QC|NS|NB|NL|PE|NT|NU|YT)\b/
  );
  if (!provinceMatch || subtotal <= 0) return { province: null, tax_warning: null };

  const prov = provinceMatch[1];
  const expected = PROVINCE_TAX[prov];
  if (!expected) return { province: prov, tax_warning: null };

  const expectedGST = Math.round(subtotal * expected.gst * 100) / 100;
  const expectedPST = Math.round(subtotal * expected.pst * 100) / 100;

  const warnings: string[] = [];
  if (Math.abs(tax_amount - expectedGST) > 0.10 && tax_amount > 0) {
    warnings.push(`GST expected ~$${expectedGST.toFixed(2)} for ${prov}, got $${tax_amount.toFixed(2)}`);
  }
  if (expected.pst > 0 && Math.abs(pst_amount - expectedPST) > 0.10) {
    warnings.push(`PST expected ~$${expectedPST.toFixed(2)} for ${prov}, got $${pst_amount.toFixed(2)}`);
  }
  if (expected.pst === 0 && pst_amount > 0) {
    warnings.push(`${prov} has no PST but $${pst_amount.toFixed(2)} PST was detected`);
  }

  return {
    province: prov,
    tax_warning: warnings.length > 0 ? warnings.join('; ') : null,
  };
}

/** Run a second Gemini pass to self-correct math, dates, and BN format */
async function selfCorrectExtraction(
  genAI: GoogleGenerativeAI,
  firstPass: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.05, responseMimeType: 'application/json' },
    });

    const validationPrompt = `You previously extracted this receipt data:
${JSON.stringify(firstPass)}

Verify these rules and return ONLY a corrected JSON object:
1) subtotal + tax_amount + pst_amount should equal total_amount (within $0.05). If not, adjust the amounts to be internally consistent.
2) transaction_date must be a valid ISO date (YYYY-MM-DD). If invalid, set to today.
3) If vendor_tax_number exists, verify it loosely matches pattern digits followed by RT and 4 digits. If clearly wrong, set to empty string.
4) If any field looks hallucinated or impossible (negative amounts, future dates beyond 30 days, vendor_name that is gibberish), set it to null.
5) Ensure confidence_score reflects your actual confidence (0-100) after corrections.

Return the corrected JSON only. Keep the same schema.`;

    const result = await model.generateContent([validationPrompt]);
    const corrected = parseSafely(result.response.text());
    return corrected;
  } catch {
    // If self-correction fails, return original data unchanged
    return firstPass;
  }
}

// Optimize embedding by omitting boolean flags and empty strings
export async function generateEmbedding(form: {
  vendor_name: string; category: string; notes: string;
  vendor_address?: string; transaction_date?: string; total_amount?: number;
}): Promise<number[] | null> {
  if (!process.env.GOOGLE_AI_KEY) return null;
  try {
    const text = [
      form.vendor_name,
      form.category,
      form.notes,
      form.vendor_address,
      form.transaction_date,
      form.total_amount ? `$${form.total_amount.toFixed(2)} CAD` : '',
    ].filter(Boolean).join(' | ');

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (err) {
    console.error("Embedding error", err);
    return null;
  }
}

export async function scanReceipt(base64Image: string, captureSource: string = 'camera'): Promise<ScanReceiptResult> {
  if (!process.env.GOOGLE_AI_KEY) return { success: false, error: 'AI service not configured.' };
  
  if (base64Image.length > 6_000_000) {
    return { success: false, error: 'Image too large. Maximum 4MB after encoding.' };
  }
  
  const payload = preparePayload(base64Image);

  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    });

    const result = await model.generateContent([
      buildPrompt(captureSource),
      { inlineData: { data: payload.data, mimeType: payload.mimeType } },
    ]);

    const rawParsed = parseSafely(result.response.text());

    // AI Self-Correction Pass — validate math, dates, BN format
    const parsed = await selfCorrectExtraction(genAI, rawParsed);

    // Basic sanitize (condensed for Godmode build)
    const vendor_name = toStr(parsed.vendor_name) || 'Unknown Vendor';
    const subtotal = toNum(parsed.subtotal);
    const tax_amount = toNum(parsed.tax_amount);
    const pst_amount = toNum(parsed.pst_amount);
    const total_amount = toNum(parsed.total_amount);

    // Province tax validation
    const vendorAddr = toStr(parsed.vendor_address);
    const { province, tax_warning } = validateProvinceTax(vendorAddr, subtotal, tax_amount, pst_amount);

    return {
      success: true,
      data: {
        vendor_name,
        vendor_address: vendorAddr,
        business_number: toStr(parsed.vendor_tax_number),
        total_amount,
        subtotal,
        tax_amount,
        pst_amount,
        transaction_date: normalizeDate(toStr(parsed.transaction_date)),
        transaction_time: toStr(parsed.transaction_time),
        payment_method: toStr(parsed.payment_method),
        payment_reference: toStr(parsed.payment_reference),
        card_last_four: toStr(parsed.card_last_four).replace(/\D/g, '').slice(-4),
        category: toStr(parsed.category),
        notes: [SMART_PURPOSE[toStr(parsed.category) as ValidCategory] || '', tax_warning ? `⚠️ Tax Alert: ${tax_warning}` : ''].filter(Boolean).join(' — '),
        currency: toStr(parsed.currency) || 'CAD',
        confidence_score: toNum(parsed.confidence_score) || 85,
        cra_readiness_score: 0, // Computed live on client
        thermal_warning: Boolean(parsed.thermal_warning),
        document_type: (toStr(parsed.document_type).toLowerCase() || 'receipt') as any,
        duplicate_warning: false,
        duplicate_hash: '',
        math_mismatch_warning: Math.abs((subtotal + tax_amount + pst_amount) - total_amount) > 0.05,
        missing_bn_warning: !toStr(parsed.vendor_tax_number) && tax_amount > 0,
        fraud_suspicion: Boolean(parsed.fraud_suspicion),
        fraud_reason: toStr(parsed.fraud_reason),
        line_items: Array.isArray(parsed.line_items) ? parsed.line_items.map((i: Record<string, unknown>) => ({
          description: toStr(i.description), quantity: toNum(i.quantity) || 1, unit_price: toNum(i.unit_price), tax_amount: toNum(i.tax_amount), line_total: toNum(i.line_total)
        })) : []
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Receipt scan failed.';
    return { success: false, error: message };
  }
}