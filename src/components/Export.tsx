'use client';

import { useMemo, useState } from 'react';
import JSZip from 'jszip';
import {
  AlertTriangle,
  Download,
  FileArchive,
  FileText,
  Fingerprint,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

import type { ReceiptRow } from '@/lib/types';
import { toNumber } from '@/lib/ui-utils';
import { formatDineroIntl } from '@/lib/finance-utils';
import { format } from 'date-fns';

interface ExportProps {
  receipts: ReceiptRow[];
}

function getVendor(r: ReceiptRow): string {
  return String(r.vendor_name ?? 'Unknown Vendor').trim() || 'Unknown Vendor';
}

function getDate(r: ReceiptRow): string {
  return String(r.transaction_date ?? '').trim();
}

function getCategory(r: ReceiptRow): string {
  return String(r.category ?? 'Uncategorized').trim() || 'Uncategorized';
}

function getTotal(r: ReceiptRow): number {
  return toNumber(r.total_amount);
}

function getGST(r: ReceiptRow): number {
  return toNumber(r.tax_amount);
}

function getPST(r: ReceiptRow): number {
  return toNumber(r.pst_amount);
}

function getBN(r: ReceiptRow): string {
  return String(r.vendor_tax_number ?? '').trim();
}

function getImageUrl(r: ReceiptRow): string {
  return String(r.image_url ?? '').trim();
}

function getHash(r: ReceiptRow): string {
  return String(r.integrity_hash ?? '').trim();
}

function formatDateInput(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function withinRange(r: ReceiptRow, from: string, to: string): boolean {
  const date = getDate(r);
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function stringifyLineItems(lineItems: ReceiptRow['line_items']): string {
  if (!lineItems) return '';
  if (typeof lineItems === 'string') return lineItems;
  try {
    return JSON.stringify(lineItems);
  } catch {
    return '';
  }
}

function buildCSV(receipts: ReceiptRow[]): string {
  const headers = [
    'Date', 'Vendor', 'Vendor Address', 'Category', 'Payment Method',
    'Card Last 4', 'Currency', 'Exchange Rate', 'CAD Equivalent',
    'Subtotal', 'GST', 'PST', 'Total',
    'Business Number (GST/BN)', 'Business Use %', 'Job Code', 'Vehicle ID',
    'Document Type', 'Notes', 'Paid By', 'Reimbursement Status', 'Approval Status',
    'AI Fraud Suspicion', 'AI Fraud Reason', 'Blur Score',
    'Line Items', 'Integrity Hash', 'Image URL',
  ];

  const rows = receipts.map((r) => [
    getDate(r),
    getVendor(r),
    String(r.vendor_address ?? ''),
    getCategory(r),
    String(r.payment_method ?? ''),
    String(r.card_last_four ?? ''),
    String(r.currency ?? 'CAD'),
    toNumber((r as any).exchange_rate ?? 1).toFixed(4),
    (r as any).cad_equivalent != null ? toNumber((r as any).cad_equivalent).toFixed(2) : '',
    toNumber(r.subtotal).toFixed(2),
    getGST(r).toFixed(2),
    getPST(r).toFixed(2),
    getTotal(r).toFixed(2),
    getBN(r),
    toNumber(r.business_use_percent ?? 100).toFixed(0),
    String(r.job_code ?? ''),
    String(r.vehicle_id ?? ''),
    String(r.document_type ?? 'receipt'),
    String(r.notes ?? ''),
    String(r.paid_by ?? ''),
    String(r.reimbursement_status ?? ''),
    String(r.approval_status ?? ''),
    (r as any).fraud_suspicion ? 'TRUE' : 'FALSE',
    String((r as any).fraud_reason ?? ''),
    (r as any).blur_score != null ? toNumber((r as any).blur_score).toFixed(1) : '',
    stringifyLineItems(r.line_items),
    getHash(r),
    getImageUrl(r),
  ]);

  return '\ufeff' + [headers.map(csvEscape).join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
}

function buildIDEACSV(receipts: ReceiptRow[]): string {
  const headers = [
    'Integrity Hash (SHA-256)', 'User ID', 'Transaction Date', 'Vendor Name', 
    'Vendor Tax Number', 'Subtotal', 'Taxes', 'Total Amount', 'Job Code', 'Approval Status'
  ];

  const rows = receipts.map((r) => [
    getHash(r),
    String(r.user_id ?? 'Unknown'),
    getDate(r),
    getVendor(r),
    getBN(r),
    toNumber(r.subtotal).toFixed(2),
    (getGST(r) + getPST(r)).toFixed(2),
    getTotal(r).toFixed(2),
    String(r.job_code ?? ''),
    String(r.approval_status ?? ''),
  ]);

  return '\ufeff' + [headers.map(csvEscape).join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
}

function buildLogbook(receipts: ReceiptRow[]): string {
  const headers = [
    'Filename', 'Date', 'Vendor', 'Total (Original)', 'Currency',
    'CAD Equivalent', 'Exchange Rate', 'Document Type', 'SHA-256 Hash',
    'Blur Score', 'Approval Status', 'Estimate Warning',
  ];

  const rows = receipts
    .filter((r) => getImageUrl(r) || getHash(r))
    .map((r) => {
      const filename = (() => {
        const url = getImageUrl(r);
        if (url) {
          const last = url.split('/').pop() || `${r.id}.jpg`;
          return last.split('?')[0];
        }
        return `${r.id}.jpg`;
      })();

      return [
        filename,
        getDate(r),
        getVendor(r),
        getTotal(r).toFixed(2),
        String(r.currency ?? 'CAD'),
        (r as any).cad_equivalent != null ? toNumber((r as any).cad_equivalent).toFixed(2) : getTotal(r).toFixed(2),
        toNumber((r as any).exchange_rate ?? 1).toFixed(4),
        String(r.document_type ?? 'receipt'),
        getHash(r),
        (r as any).blur_score != null ? toNumber((r as any).blur_score).toFixed(1) : 'N/A',
        String(r.approval_status ?? 'submitted'),
        r.document_type === 'estimate' ? 'NON-DEDUCTIBLE ESTIMATE' : '',
      ];
    });

  return '\ufeff' + [headers.map(csvEscape).join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
}

export default function Export({ receipts }: ExportProps) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [zipping, setZipping] = useState(false);

  const filteredReceipts = useMemo(
    () => receipts.filter((r) => withinRange(r, fromDate, toDate)),
    [receipts, fromDate, toDate]
  );

  const totals = useMemo(() => {
    const total = filteredReceipts.reduce((sum, r) => sum + getTotal(r), 0);
    const gst = filteredReceipts.reduce((sum, r) => sum + getGST(r), 0);
    const pst = filteredReceipts.reduce((sum, r) => sum + getPST(r), 0);
    const reimbursementPending = filteredReceipts.filter(
      (r) => r.paid_by === 'employee_cash' && r.reimbursement_status === 'pending'
    ).length;
    return { total, gst, pst, count: filteredReceipts.length, reimbursementPending };
  }, [filteredReceipts]);

  async function downloadCSV() {
    if (filteredReceipts.length === 0) return;

    const csv = buildCSV(filteredReceipts);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-pro-export-${formatDateInput(new Date())}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }

  async function downloadIDEAExport() {
    if (filteredReceipts.length === 0) return;

    const csv = buildIDEACSV(filteredReceipts);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-pro-idea-export-${formatDateInput(new Date())}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }

  async function downloadAuditPackage() {
    if (filteredReceipts.length === 0 || zipping) return;

    setZipping(true);

    try {
      const zip = new JSZip();

      zip.file('receipts.csv', buildCSV(filteredReceipts));
      zip.file('LOGBOOK.csv', buildLogbook(filteredReceipts));
      zip.file(
        'README.txt',
        [
          '9 Star Labs — CRA Audit Package',
          '================================================',
          '',
          'This package is prepared for CRA recordkeeping and audit support under IC05-1R1.',
          '',
          'Contents:',
          '- receipts.csv: Full transaction register with GST/PST, exchange rates, document types,',
          '  payment context, reimbursement and approval status, line items, and integrity hashes.',
          '- LOGBOOK.csv: Chain-of-custody log mapping filenames to SHA-256 hashes, blur scores,',
          '  document types, and operators. ESTIMATE rows are flagged NON-DEDUCTIBLE.',
          '- images/: Source receipt images for the selected period.',
          '',
          'Chain of Custody:',
          '- Each receipt image filename maps to a SHA-256 hash in LOGBOOK.csv.',
          '- Hashes are computed from the raw binary of the image at the moment of capture.',
          '- To verify integrity: recompute the SHA-256 of each image and compare to LOGBOOK.',
          '',
          'Non-Deductible Items:',
          '- Rows with Document Type = \'estimate\' are flagged as NON-DEDUCTIBLE ESTIMATE.',
          '- Do not submit estimates as final expense claims to CRA.',
          '',
          'Retention Policy:',
          '- Retain original records for a minimum of 6 years (Income Tax Act, s. 230).',
          '- Do not delete source files while an audit hold is active.',
          '- Keep exported packages alongside original source records.',
          '',
          'Generated by 9 Star Labs — CRA-Ready Receipt Intelligence',
          'Contact: legal@9starlabs.ca',
        ].join('\n')
      );

      const imageFolder = zip.folder('images');
      if (imageFolder) {
        await Promise.allSettled(
          filteredReceipts.map(async (r) => {
            const imageUrl = getImageUrl(r);
            if (!imageUrl) return;

            try {
              const response = await fetch(imageUrl);
              const blob = await response.blob();
              const filename = imageUrl.split('/').pop()?.split('?')[0] || `${r.id}.jpg`;
              imageFolder.file(filename, blob);
            } catch {
              imageFolder.file(`${r.id}.txt`, 'Image unavailable for this record.');
            }
          })
        );
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `9starlabs-cra-audit-package-${formatDateInput(new Date())}.zip`;
      a.click();

      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  return (
    <section className="space-y-5 fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-champagne">Export center</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">CRA Export — 9 Star Labs</h2>
        </div>

        <div className="rounded-2xl border border-glass-border bg-surface px-3 py-2 text-xs font-medium text-text-secondary shadow-sm">
          {filteredReceipts.length} receipt{filteredReceipts.length === 1 ? '' : 's'} in range
        </div>
      </div>

      <div className="grid gap-3 rounded-3xl border border-glass-border bg-surface p-4 shadow-sm sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full rounded-2xl border border-glass-border bg-surface-raised px-4 py-3 text-sm text-text-primary outline-none transition focus:border-champagne/40 focus:ring-2 focus:ring-champagne/15"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full rounded-2xl border border-glass-border bg-surface-raised px-4 py-3 text-sm text-text-primary outline-none transition focus:border-champagne/40 focus:ring-2 focus:ring-champagne/15"
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <button
          type="button"
          onClick={downloadCSV}
          disabled={filteredReceipts.length === 0}
          className="rounded-3xl border border-glass-border bg-surface p-4 text-left shadow-sm transition hover:border-glass-border-hover hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-light">
              <FileText className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-text-primary">Download CSV Spreadsheet</p>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                Includes date, vendor, taxes, payment context, reimbursement status, job codes, line items, and integrity hash.
              </p>
            </div>
            <Download className="mt-1 h-4 w-4 flex-shrink-0 text-text-muted" />
          </div>
        </button>

        <button
          type="button"
          onClick={downloadAuditPackage}
          disabled={filteredReceipts.length === 0 || zipping}
          className="rounded-3xl border border-glass-border bg-surface p-4 text-left shadow-sm transition hover:border-glass-border-hover hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-champagne/10 text-champagne">
              {zipping ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileArchive className="h-6 w-6" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-text-primary">Download CRA Audit Package (ZIP)</p>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                Contains receipts.csv, LOGBOOK.csv, README.txt, and the images/ folder with source images for chain-of-custody.
              </p>
            </div>
            <Download className="mt-1 h-4 w-4 flex-shrink-0 text-text-muted" />
          </div>
        </button>

        <button
          type="button"
          onClick={downloadIDEAExport}
          disabled={filteredReceipts.length === 0}
          className="rounded-3xl border border-glass-border bg-surface p-4 text-left shadow-sm transition hover:border-glass-border-hover hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
              <FileArchive className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-text-primary">Generate Structured Audit Export</p>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                Flat CSV mapped for the CRA IDEA audit software framework. 
              </p>
            </div>
            <Download className="mt-1 h-4 w-4 flex-shrink-0 text-text-muted" />
          </div>
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-3xl border border-glass-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Total</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-text-primary">{formatDineroIntl(totals.total)}</p>
        </div>
        <div className="rounded-3xl border border-glass-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">GST</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-champagne">{formatDineroIntl(totals.gst)}</p>
        </div>
        <div className="rounded-3xl border border-glass-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">PST</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-text-primary">{formatDineroIntl(totals.pst)}</p>
        </div>
        <div className="rounded-3xl border border-glass-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Pending Claims</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-amber-400">{totals.reimbursementPending}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-amber-500/15 bg-amber-500/[0.04] p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 shadow-sm">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary">6-Year Retention Policy</p>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              CRA recordkeeping expects original receipt records to be retained for at least 6 years. This export helps
              preserve a complete, auditable package with the source images, hash log, and spreadsheet data.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-glass-border bg-surface p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-champagne/10 text-champagne">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary">Audit package contents</p>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              LOGBOOK.csv includes the filename, date, vendor, total, SHA-256 hash, and approval status for each image so the package can be
              verified against the source records for legal chain-of-custody.
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
              <Fingerprint className="h-4 w-4 text-emerald-light" />
              <span>Integrity hashes included on every eligible receipt.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}