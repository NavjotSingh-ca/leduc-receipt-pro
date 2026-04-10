// FILE 1: src/app/actions/scan-receipt.ts
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
  notes: string; // Added for business purpose inference
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

// ── Allowed categories ─ must match frontend ──────────────────
const VALID_CATEGORIES = [
  'Office Supplies',
  'Meals & Entertainment',
  'Travel',
  'Fuel',
  'Professional Fees',
  'Supplies',
  'General Expense',
] as const;

const CRA_PROMPT = `Act as an expert Canadian accountant (CRA-compliant, Alberta-focused).

Analyze this receipt image and return ONLY valid JSON — no markdown, no explanations.

JSON shape:
{
  "vendor_name": "string — business name",
  "total_amount": number — grand total incl. taxes,
  "tax_amount": number — GST only (Alberta 5%; parse line items if unclear),
  "vendor_tax_number": "string — BN format 123456789RT0001 or \"\" if missing",
  "transaction_date": "string — YYYY-MM-DD or today",
  "category": "string — exactly one of: ${VALID_CATEGORIES.join(' | ')}",
  "notes": "string — infer business purpose e.g. 'Fuel for company vehicle' if Fuel category; required for CRA audit trail"
}

Rules:
- Numbers: plain (52.49), >=0, round to 2 decimals internally.
- Alberta GST: exactly 5% — ignore PST.
- Defaults: 0 numbers, "" strings.
- Business purpose: always infer practical use (e.g. Office Supplies → 'Printer ink for accounting').
- ONLY JSON.`;

function extractJSON(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();

  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];

  return raw.trim();
}

function sanitizeData(raw: Record<string, unknown>): ScannedReceiptData {
  const toNumber = (v: unknown): number => {
    const n = typeof v === 'string' ? parseFloat(v.replace(/[^0-9.-]/g, '')) : Number(v);
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
  };

  const toString = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const rawCategory = toString(raw.category);
  const category = VALID_CATEGORIES.includes(rawCategory as any) ? rawCategory : 'General Expense';

  const dateRaw = toString(raw.transaction_date);
  const transaction_date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : new Date().toISOString().split('T')[0];

  return {
    vendor_name: toString(raw.vendor_name) || 'Unknown Vendor',
    total_amount: toNumber(raw.total_amount),
    tax_amount: toNumber(raw.tax_amount),
    vendor_tax_number: toString(raw.vendor_tax_number),
    transaction_date,
    category,
    notes: toString(raw.notes) || '',
  };
}

export async function scanReceipt(base64Image: string): Promise<ScanReceiptResult> {
  if (!process.env.GOOGLE_AI_KEY) {
    return { success: false, error: 'AI key missing.' };
  }

  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
  if (!base64Data || base64Data.length < 100) {
    return { success: false, error: 'Invalid image.' };
  }

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

    const imagePart = { inlineData: { data: base64Data, mimeType: 'image/jpeg' } };
    const result = await model.generateContent([CRA_PROMPT, imagePart]);
    const rawText = result.response.text();

    if (!rawText?.trim()) {
      return { success: false, error: 'Empty AI response.' };
    }

    const jsonString = extractJSON(rawText);
    const parsed = JSON.parse(jsonString);
    const data = sanitizeData(parsed);

    return { success: true, data };
  } catch (err: any) {
    const msg = err.message || 'Unknown error';
    if (msg.includes('API_KEY_INVALID')) return { success: false, error: 'Invalid AI key.' };
    if (msg.includes('RESOURCE_EXHAUSTED')) return { success: false, error: 'Quota exceeded.' };
    console.error('[scanReceipt]', msg);
    return { success: false, error: 'Scan failed.' };
  }
}