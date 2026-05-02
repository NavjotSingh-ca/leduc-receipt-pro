'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import type { ReceiptRow } from '@/lib/types';
import { toNumber, formatCurrency } from '@/lib/ui-utils';

interface BankReconciliationProps {
  receipts: ReceiptRow[];
}

type BankRow = {
  date: string;
  amount: number;
  description: string;
  id: string;
};

type MatchResult = {
  bankRow: BankRow;
  receipt: ReceiptRow | null;
  score: number;
};

// TODO: Pre-indexing Levenshtein (e.g. using a BK-Tree or sorted n-gram index) to achieve O(n log n)
// search is out-of-scope for this sprint. Below is a space-optimized O(min(m,n)) memory implementation.
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  if (a.length > b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }
  
  const row = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let i = 1; i <= b.length; i++) {
    let prev = i;
    for (let j = 1; j <= a.length; j++) {
      let val;
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        val = row[j - 1];
      } else {
        val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
      }
      row[j - 1] = prev;
      prev = val;
    }
    row[a.length] = prev;
  }
  return row[a.length];
}

export default function BankReconciliation({ receipts }: BankReconciliationProps) {
  const [bankData, setBankData] = useState<BankRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');

    try {
      let text = '';
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        throw new Error('PDF parsing is no longer supported. Please upload a CSV.');
      } else {
        text = await file.text();
      }

      const lines = text.split('\n').filter((l) => l.trim() !== '');
      if (lines.length === 0) throw new Error('File is empty.');

      const headers = lines[0].toLowerCase().split(',').map((s) => s.trim());
      const dateIdx = headers.findIndex((h) => h.includes('date'));
      const descIdx = headers.findIndex((h) => h.includes('description') || h.includes('memo') || h.includes('name'));
      const amtIdx = headers.findIndex((h) => h.includes('amount') || h.includes('debit'));

      const dataLines = (dateIdx >= 0 && descIdx >= 0) ? lines.slice(1) : lines;

      const parsedData: BankRow[] = dataLines.map((line, idx) => {
        const cols = line.split(',').map((s) => s.trim());
        const date = dateIdx >= 0 ? cols[dateIdx] : cols[0] || '';
        const description = descIdx >= 0 ? cols[descIdx] : cols[1] || 'Unknown';
        const amtStr = amtIdx >= 0 ? cols[amtIdx] : cols[2] || cols[cols.length - 1] || '0';
        const amount = Math.abs(parseFloat(amtStr.replace(/[^0-9.-]/g, '')));
        return { id: `bank-${idx}`, date, description, amount };
      }).filter((r) => r.amount > 0 && r.date);

      if (parsedData.length === 0) {
        throw new Error('No valid transactions found.');
      }

      setBankData(parsedData);
    } catch (err) {
      console.error(err);
      setError('Failed to parse bank file. Ensure it has Date, Description, and Amount.');
    } finally {
      setLoading(false);
    }
  };

  const matches: MatchResult[] = useMemo(() => {
    const sortedReceipts = [...receipts].sort((a, b) => toNumber(a.total_amount) - toNumber(b.total_amount));

    return bankData.map(bankRow => {
      let bestMatch: ReceiptRow | null = null;
      let highestScore = 0;

      // Binary search to find the candidate range in O(log n)
      const findIndex = (amt: number) => {
        let low = 0, high = sortedReceipts.length;
        while (low < high) {
          let mid = (low + high) >>> 1;
          if (toNumber(sortedReceipts[mid].total_amount) < amt) low = mid + 1;
          else high = mid;
        }
        return low;
      };

      const startIdx = findIndex(bankRow.amount - 1.0);
      const endIdx = findIndex(bankRow.amount + 1.0);
      const candidates = sortedReceipts.slice(startIdx, endIdx);

      for (const receipt of candidates) {
        let score = 0;
        const receiptTotal = toNumber(receipt.total_amount);

        // Exact amount match is huge
        if (Math.abs(receiptTotal - bankRow.amount) < 0.05) score += 60;
        // Date match (exact is 20, 1 day off is 10)
        if (receipt.transaction_date === bankRow.date) {
          score += 20;
        } else if (receipt.transaction_date) {
          const rDate = new Date(receipt.transaction_date).getTime();
          const bDate = new Date(bankRow.date).getTime();
          if (Math.abs(rDate - bDate) <= 86400000) score += 10;
        }
        
        // Vendor name fuzzy match using Levenshtein
        const rName = (receipt.vendor_name || '').toLowerCase().trim();
        const bDesc = bankRow.description.toLowerCase().trim();
        if (rName && bDesc) {
          const distance = levenshteinDistance(rName, bDesc.substring(0, rName.length));
          if (distance === 0) score += 20;
          else if (distance <= 2) score += 15;
          else if (bDesc.includes(rName.substring(0, 4))) score += 10;
        }

        if (score > highestScore) {
          highestScore = score;
          bestMatch = receipt;
        }
      }

      return { bankRow, receipt: highestScore >= 60 ? bestMatch : null, score: highestScore };
    });
  }, [bankData, receipts]);

  const matchedCount = matches.filter(m => m.receipt).length;

  return (
    <div className="space-y-6 fade-in pb-10">
      <div>
        <h2 className="text-xl font-bold text-text-primary">Bank Reconciliation</h2>
        <p className="mt-1 text-sm text-text-secondary">Upload a bank statement CSV to AI-fuzzy match transactions against receipts.</p>
      </div>

      {bankData.length === 0 && (
        <div className="rounded-3xl border border-dashed border-glass-border bg-surface p-12 text-center transition hover:bg-surface-raised">
          <FileSpreadsheet className="mx-auto mb-3 h-12 w-12 text-text-muted/30" />
          <p className="text-sm font-semibold text-text-primary">No bank statement uploaded.</p>
          <p className="mt-1 text-xs text-text-secondary mb-4">CSV format: Date, Description, Amount</p>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#dfcaaa] to-champagne px-4 py-3 text-sm font-bold text-black shadow-lg transition hover:opacity-90">
            <Upload className="h-4 w-4" />
            Upload File
            <input type="file" accept=".csv,application/pdf" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      )}

      {loading && (
        <div className="flex justify-center p-8">
          <RefreshCw className="h-8 w-8 animate-spin text-champagne" />
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {bankData.length > 0 && !loading && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-glass-border bg-surface p-4 shadow-sm">
            <div>
              <p className="text-sm font-bold text-text-primary">Match Results</p>
              <p className="text-xs text-text-secondary">Found receipts for {matchedCount} out of {bankData.length} transactions.</p>
            </div>
            <label className="cursor-pointer text-xs font-semibold text-champagne hover:text-champagne/80">
              Upload New File
              <input type="file" accept=".csv,application/pdf" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>

          <div className="space-y-3">
            {matches.map((m, idx) => (
              <motion.div 
                key={m.bankRow.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="rounded-2xl border border-glass-border bg-surface p-4 shadow-sm"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="min-w-0 md:w-1/2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Bank Transaction</p>
                    <p className="mt-1 truncate text-sm font-semibold text-text-primary">{m.bankRow.description}</p>
                    <div className="mt-1 flex items-center gap-3">
                      <p className="text-xs text-text-secondary">{m.bankRow.date}</p>
                      <p className="text-sm font-bold tabular-nums text-text-secondary">{formatCurrency(m.bankRow.amount, 'CAD')}</p>
                    </div>
                  </div>

                  <div className="md:w-1/2 rounded-xl border border-white/5 bg-black/20 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Receipt Match</p>
                    {m.receipt ? (
                      <div className="mt-1">
                        <div className="flex items-center justify-between">
                          <p className="truncate text-sm font-medium text-text-primary">{m.receipt.vendor_name}</p>
                          <p className="text-sm font-bold tabular-nums text-champagne">{formatCurrency(toNumber(m.receipt.total_amount), 'CAD')}</p>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-light" />
                          <span className="text-[10px] font-bold text-emerald-light uppercase tracking-wide">{m.score}% Match Score</span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-400" />
                        <span className="text-xs text-amber-400">No matching receipt found.</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
