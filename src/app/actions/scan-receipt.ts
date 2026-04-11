'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ScannedReceiptData {
  vendor_name: string;
  total_amount: number;
  tax_amount: number;
  vendor_tax_number: string;
  transaction_date: string;
  category: string;
  notes: string;
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

// ── Allowed categories — must match frontend ───────────────────────────────────
const VALID_CATEGORIES = [
  'Office Supplies',
  'Meals & Entertainment',
  'Travel',
  'Fuel',
  'Professional Fees',
  'Supplies',
  'General Expense',
] as const;

type ValidCategory = (typeof VALID_CATEGORIES)[number];

// ── Business Purpose Map ───────────────────────────────────────────────────────
// Fallback inferences when AI notes field is missing or too vague
const PURPOSE_MAP: Record<ValidCategory, string> = {
  Fuel: 'Fuel for company vehicle',
  'Meals & Entertainment': 'Business meal / client entertainment',
  'Office Supplies': 'Office supplies for business operations',
  Travel: 'Business travel expense',
  'Professional Fees': 'Professional services for business',
  Supplies: 'Business supplies and materials',
  'General Expense': 'Business operating expense',
};

// ── AI Prompt ──────────────────────────────────────────────────────────────────
const CRA_PROMPT = `You are an expert Canadian chartered accountant specializing in CRA-compliant expense reporting for Alberta-based small businesses.

Analyze this receipt image and return ONLY valid JSON — no markdown fences, no explanations, no preamble.

Required JSON shape (all fields mandatory):
{
  "vendor_name": "string — the business name as printed on the receipt",
  "total_amount": number — grand total including all taxes (e.g. 52.49),
  "tax_amount": number — GST amount only (Alberta rate is exactly 5%; calculate from subtotal if not shown as a line item),
  "vendor_tax_number": "string — CRA Business Number in format 123456789RT0001, or empty string if not on receipt",
  "transaction_date": "string — date in YYYY-MM-DD format",
  "category": "string — must be EXACTLY one of: ${VALID_CATEGORIES.join(' | ')}",
  "notes": "string — infer a specific, practical business purpose for CRA audit trail (e.g. 'Fuel for company delivery vehicle', 'Client lunch meeting at vendor name', 'Printer cartridges for office use'). Be specific and actionable."
}

Critical rules:
- All numbers must be plain decimals >= 0, rounded to 2 decimal places (e.g. 52.49, not "$52.49")
- Alberta has NO provincial sales tax — only 5% GST applies
- If tax lines are ambiguous, calculate GST as: subtotal * 0.05
- Default to empty string "" for any missing string fields
- Default to 0 for any missing number fields
- If date is unreadable, use today's date in YYYY-MM-DD
- The "notes" field must always describe a legitimate CRA-deductible business purpose
- Output ONLY the JSON object — nothing else`;

// ── Helpers ────────────────────────────────────────────────────────────────────
function extractJSON(raw: string): string {
  const fenceMatch = raw.match(/` + '```' + `(?:json)?\s*([\s\S]*?)` + '```' + `/i);
  if (fenceMatch) return fenceMatch[1].trim();
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return raw.trim();
}

function sanitizeData(raw: Record<string, unknown>): ScannedReceiptData {
  const toNumber = (v: unknown): number => {
    const n =
      typeof v === 'string'
        ? parseFloat(v.replace(/[^0-9.-]/g, ''))
        : Number(v);
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
  };

  const toStr = (v: unknown): string =>
    typeof v === 'string' ? v.trim() : '';

  const rawCategory = toStr(raw.category);
  const category: ValidCategory = VALID_CATEGORIES.includes(
    rawCategory as ValidCategory
  )
    ? (rawCategory as ValidCategory)
    : 'General Expense';

  const dateRaw = toStr(raw.transaction_date);
  const transaction_date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
    ? dateRaw
    : new Date().toISOString().split('T')[0];

  const total_amount = toNumber(raw.total_amount);
  let tax_amount = toNumber(raw.tax_amount);

  // Alberta GST sanity check: recalculate if missing or implausible
  if (total_amount > 0) {
    const impliedGST = Math.round((total_amount / 1.05) * 0.05 * 100) / 100;
    const tolerance = Math.max(impliedGST * 0.15, 0.05);
    if (tax_amount <= 0 || Math.abs(tax_amount - impliedGST) > tolerance) {
      tax_amount = impliedGST;
    }
  }

  // Ensure notes always contains a meaningful business purpose
  const rawNotes = toStr(raw.notes);
  const notes =
    rawNotes && rawNotes.length > 8 ? rawNotes : PURPOSE_MAP[category];

  return {
    vendor_name: toStr(raw.vendor_name) || 'Unknown Vendor',
    total_amount,
    tax_amount,
    vendor_tax_number: toStr(raw.vendor_tax_number),
    transaction_date,
    category,
    notes,
  };
}

// ── Main export ────────────────────────────────────────────────────────────────
export async function scanReceipt(
  base64Image: string
): Promise<ScanReceiptResult> {
  if (!process.env.GOOGLE_AI_KEY) {
    return {
      success: false,
      error: 'AI service not configured. Check GOOGLE_AI_KEY in .env.local.',
    };
  }

  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
  if (!base64Data || base64Data.length < 200) {
    return { success: false, error: 'Invalid or empty image data.' };
  }

  const mimeMatch = base64Image.match(/^data:(image\/\w+);base64,/);
  const mimeType =
    (mimeMatch?.[1] as 'image/jpeg' | 'image/png' | 'image/webp') ??
    'image/jpeg';

  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        maxOutputTokens: 1024,
      },
    });

    const imagePart = { inlineData: { data: base64Data, mimeType } };
    const result = await model.generateContent([CRA_PROMPT, imagePart]);
    const rawText = result.response.text();

    if (!rawText?.trim()) {
      return {
        success: false,
        error: 'AI returned an empty response. Please try again.',
      };
    }

    const jsonString = extractJSON(rawText);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      console.error('[scanReceipt] JSON parse failed. Raw:', rawText);
      return {
        success: false,
        error:
          'Could not parse AI response. Retake the photo with better lighting.',
      };
    }

    return { success: true, data: sanitizeData(parsed) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      return { success: false, error: 'Invalid Google AI key.' };
    }
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
      return { success: false, error: 'AI quota exceeded. Try again later.' };
    }
    if (msg.includes('SAFETY')) {
      return {
        success: false,
        error: 'Image blocked by safety filter. Use a clearer receipt photo.',
      };
    }

    console.error('[scanReceipt] Unexpected error:', msg);
    return {
      success: false,
      error: 'Receipt scan failed. Ensure the image is clear and well-lit.',
    };
  }
}