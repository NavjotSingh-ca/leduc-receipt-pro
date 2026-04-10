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

// ── Allowed categories — must match the dropdown in page.tsx ──────────────────
const VALID_CATEGORIES = [
  'Office Supplies',
  'Meals & Entertainment',
  'Travel',
  'Fuel',
  'Professional Fees',
  'Supplies',
  'General Expense',
] as const;

const CRA_PROMPT = `Act as an expert Canadian accountant (CRA-compliant).
Analyze this receipt image and return ONLY a valid JSON object — no markdown, no code fences, no explanation.

JSON shape:
{
  "vendor_name": "string — business name on the receipt",
  "total_amount": number — grand total including all taxes,
  "tax_amount": number — GST/HST amount only (Alberta charges 5% GST; other provinces may add PST/HST),
  "vendor_tax_number": "string — CRA Business Number (BN) in format 123456789RT0001, or empty string if not visible",
  "transaction_date": "string — date in YYYY-MM-DD format, or today's date if not readable",
  "category": "string — one of: Office Supplies | Meals & Entertainment | Travel | Fuel | Professional Fees | Supplies | General Expense"
}

Rules:
- All number fields must be plain numbers (e.g. 52.49), never strings.
- If a field cannot be determined, use a safe default: 0 for numbers, "" for strings.
- Alberta receipts: GST is exactly 5% — do not add PST.
- Return ONLY the JSON object. Any text outside the JSON will cause a parse failure.`;

// ── JSON extraction — handles markdown fences and stray text ──────────────────
function extractJSON(raw: string): string {
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();

  // Extract first { ... } block in case of preamble text
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0].trim();

  return raw.trim();
}

function sanitizeData(raw: Record<string, unknown>): ScannedReceiptData {
  const toNumber = (v: unknown): number => {
    const n = typeof v === 'string' ? parseFloat(v.replace(/[^0-9.]/g, '')) : Number(v);
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
  };

  const toString = (v: unknown): string =>
    typeof v === 'string' ? v.trim() : '';

  const rawCategory = toString(raw.category);
  const category = (VALID_CATEGORIES as readonly string[]).includes(rawCategory)
    ? rawCategory
    : 'General Expense';

  // Validate YYYY-MM-DD — fall back to today
  const dateRaw = toString(raw.transaction_date);
  const transaction_date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
    ? dateRaw
    : new Date().toISOString().split('T')[0];

  return {
    vendor_name: toString(raw.vendor_name) || 'Unknown Vendor',
    total_amount: toNumber(raw.total_amount),
    tax_amount: toNumber(raw.tax_amount),
    vendor_tax_number: toString(raw.vendor_tax_number),
    transaction_date,
    category,
  };
}

// ── Server Action ──────────────────────────────────────────────────────────────
export async function scanReceipt(
  base64Image: string
): Promise<ScanReceiptResult> {
  // Guard: must only run server-side
  if (!process.env.GOOGLE_AI_KEY) {
    return {
      success: false,
      error: 'GOOGLE_AI_KEY is not configured on the server.',
    };
  }

  // Strip the data URL prefix if present — SDK expects raw base64
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

  if (!base64Data || base64Data.length < 100) {
    return { success: false, error: 'Invalid or empty image data.' };
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);

    // gemini-2.5-flash: GA stable as of June 2025 — multimodal, fast, cost-efficient
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.1,      // low creativity — we want deterministic structured output
        topP: 0.8,
        maxOutputTokens: 512,  // JSON response is small; hard cap prevents runaway billing
      },
    });

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: 'image/jpeg' as const,
      },
    };

    const result = await model.generateContent([CRA_PROMPT, imagePart]);
    const rawText = result.response.text();

    if (!rawText || rawText.trim() === '') {
      return {
        success: false,
        error: 'The AI returned an empty response. Try a clearer photo.',
      };
    }

    const jsonString = extractJSON(rawText);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      console.error('[scanReceipt] JSON parse failed. Raw AI output:', rawText);
      return {
        success: false,
        error: 'Could not parse AI response. Try a clearer photo.',
      };
    }

    const data = sanitizeData(parsed);

    return { success: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    // Surface quota/auth errors clearly without leaking internals
    if (message.includes('API_KEY_INVALID')) {
      return { success: false, error: 'Invalid Google AI API key.' };
    }
    if (message.includes('RESOURCE_EXHAUSTED')) {
      return { success: false, error: 'API quota exceeded. Try again shortly.' };
    }
    if (message.includes('SAFETY')) {
      return {
        success: false,
        error: 'Image was flagged by safety filters. Try a different photo.',
      };
    }

    console.error('[scanReceipt] Unexpected error:', message);
    return {
      success: false,
      error: 'Scan failed. Check your connection and try again.',
    };
  }
}