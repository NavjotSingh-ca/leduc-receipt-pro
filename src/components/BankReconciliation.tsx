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

// Basic Levenshtein distance for fuzzy matching
function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export default function BankReconciliation({ receipts }: BankReconciliationProps) {
  const [bankData, setBankData] = useState<BankRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(l => l.trim() !== '');
        // Assume basic CSV: date, description, amount
        const parsedData: BankRow[] = lines.map((line, idx) => {
          const cols = line.split(',');
          // Extremely basic fallback parsing simulation
          const date = cols[0] || '';
          const description = cols[1] || 'Unknown';
          const amount = Math.abs(parseFloat(cols[2] || cols[cols.length - 1] || '0'));
          return { id: `bank-${idx}`, date, description, amount };
        }).filter(r => r.amount > 0 && r.date);

        setBankData(parsedData);
      } catch (err) {
        setError('Failed to parse bank CSV. Please ensure it has Date, Description, and Amount.');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const matches: MatchResult[] = useMemo(() => {
    return bankData.map(bankRow => {
      let bestMatch: ReceiptRow | null = null;
      let highestScore = 0;

      for (const receipt of receipts) {
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
            Upload CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
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
              Upload New CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
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
