'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Camera, Loader2, RefreshCw, ScanLine, Upload } from 'lucide-react';
import { motion } from 'framer-motion';

import { scanReceipt } from '@/app/actions/scan-receipt';
import { generateDuplicateHash } from '@/lib/hash';
import { supabase } from '@/lib/supabase';

import ManualCropper from './scanner/ManualCropper';
import DuplicateModal from './scanner/DuplicateModal';
import ScannerForm from './scanner/ScannerForm';
import type { ReceiptForm, ReceiptRow, ScannerProps } from './scanner/types';
import { createBlankReceiptForm } from './scanner/types';

type DuplicateCandidate = ReceiptRow | null;
type NoticeTone = 'success' | 'error' | 'info';

interface NoticeState {
  tone: NoticeTone;
  message: string;
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.6;
const STORAGE_BUCKET = 'receipt-images';

export default function Scanner({ user, onSaveSuccess }: ScannerProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState('');
  const [mimeType, setMimeType] = useState('image/jpeg');
  const [formData, setFormData] = useState<ReceiptForm>(createBlankReceiptForm());

  const [loadingBusinessUnits, setLoadingBusinessUnits] = useState(true);
  const [processingAI, setProcessingAI] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showCropper, setShowCropper] = useState(false);
  const [duplicateCandidate, setDuplicateCandidate] = useState<DuplicateCandidate>(null);
  const [pendingSave, setPendingSave] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const [notice, setNotice] = useState<NoticeState | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    async function loadBusinessUnits() {
      setLoadingBusinessUnits(true);

      const { data, error } = await supabase
        .from('businessunits')
        .select('id, name')
        .order('name', { ascending: true });

      if (!active) return;

      if (error) {
        setNotice({ tone: 'error', message: 'Could not load business units.' });
      } else {
        setBusinessUnits((data ?? []) as { id: string; name: string }[]);
      }

      setLoadingBusinessUnits(false);
    }

    loadBusinessUnits();

    return () => {
      active = false;
    };
  }, []);

  const canProcess = useMemo(() => Boolean(imageSrc) && !processingAI, [imageSrc, processingAI]);

  function showNotice(tone: NoticeTone, message: string) {
    setNotice({ tone, message });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4000);
  }

  function resetScanner() {
    setImageSrc(null);
    setOriginalFileName('');
    setMimeType('image/jpeg');
    setFormData(createBlankReceiptForm());
    setDuplicateCandidate(null);
    setPendingSave(false);
    setHasAnalyzed(false);

    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  }

  async function readFileAsDataUrl(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsDataURL(file);
    });
  }

  async function loadImage(src: string): Promise<HTMLImageElement> {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load image.'));
      img.src = src;
    });
  }

  async function resizeTo2000px(dataUrl: string, outputMimeType = 'image/jpeg'): Promise<string> {
    const img = await loadImage(dataUrl);

    let { width, height } = img;
    const longestSide = Math.max(width, height);

    if (longestSide > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / longestSide;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL(outputMimeType, JPEG_QUALITY);
  }

  function normalizeFileName(name: string) {
    return name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').toLowerCase();
  }

  function dataUrlToBlob(dataUrl: string): Blob {
    const [meta, base64] = dataUrl.split(',');
    const mime = meta.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  async function computeSHA256(dataUrl: string): Promise<string> {
    const [, base64] = dataUrl.split(',');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes.buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function toDbPayload(receiptForm: ReceiptForm, publicUrl: string, integrityHash: string) {
    const now = new Date().toISOString();

    return {
      user_id: user?.id ?? '',
      business_unit_id: receiptForm.business_unit_id || null,
      vendor_name: receiptForm.vendor_name.trim(),
      vendor_address: receiptForm.vendor_address.trim() || null,
      vendor_tax_number: receiptForm.business_number.trim() || null,
      total_amount: Number(receiptForm.total_amount || 0),
      subtotal: Number(receiptForm.subtotal || 0),
      tax_amount: Number(receiptForm.tax_amount || 0),
      pst_amount: Number(receiptForm.pst_amount || 0),
      transaction_date: receiptForm.transaction_date,
      transaction_time: receiptForm.transaction_time || null,
      payment_method: receiptForm.payment_method,
      payment_reference: receiptForm.payment_reference.trim() || null,
      card_last_four: receiptForm.card_last_four.trim() || null,
      category: receiptForm.category,
      notes: receiptForm.notes.trim(),
      currency: receiptForm.currency,
      image_url: publicUrl,
      source_file_name: originalFileName || null,
      source_file_type: 'image',
      integrity_hash: integrityHash,
      duplicate_hash: receiptForm.duplicate_hash || null,
      confidence_score: Number(receiptForm.confidence_score || 0),
      cra_readiness_score: Number(receiptForm.cra_readiness_score || 0),
      thermal_warning: Boolean(receiptForm.thermal_warning),
      capture_source: receiptForm.capture_source,
      usage_type: receiptForm.usage_type,
      business_use_percent: Number(receiptForm.business_use_percent || 0),
      job_code: receiptForm.job_code.trim() || null,
      vehicle_id: receiptForm.vehicle_id.trim() || null,
      line_items: receiptForm.line_items ?? [],
      /* ─── Suite II: Payment Context ─── */
      paid_by: receiptForm.paid_by || null,
      reimbursement_status: receiptForm.paid_by === 'employee_cash' ? 'pending' : null,
      needs_reimbursement: receiptForm.paid_by === 'employee_cash',
      approval_status: 'submitted',
      updated_at: now,
      created_at: now,
    };
  }

  async function findDuplicateCandidate(receiptForm: ReceiptForm, integrityHash: string): Promise<ReceiptRow | null> {
    const duplicateHash = await generateDuplicateHash(
      receiptForm.vendor_name,
      receiptForm.transaction_date,
      receiptForm.total_amount,
    );

    const { data, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('user_id', user?.id ?? '')
      .or(`integrity_hash.eq.${integrityHash},duplicate_hash.eq.${duplicateHash}`)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return (data as ReceiptRow | null) ?? null;
  }

  function mergeScanData(result: Record<string, unknown>) {
    const businessNumber = String(result.business_number ?? '').trim();
    const paymentMethod = String(result.payment_method ?? formData.payment_method ?? 'Unknown').trim();

    const totalAmount = Number(result.total_amount ?? 0);
    const subtotal = Number(result.subtotal ?? 0);
    const taxAmount = Number(result.tax_amount ?? 0);
    const pstAmount = Number(result.pst_amount ?? 0);

    const confidenceScore = Number(result.confidence_score ?? 0);
    const detectedCurrency = String(result.currency ?? 'CAD').toUpperCase();

    const missingBnWarning = businessNumber.length === 0;
    const mathMismatchWarning =
      Math.abs(Number((subtotal + taxAmount + pstAmount - totalAmount).toFixed(2))) > 0.02;

    const readinessScore = Math.max(
      0,
      Math.min(
        100,
        [
          result.vendor_name ? 18 : 0,
          result.transaction_date ? 16 : 0,
          totalAmount > 0 ? 18 : 0,
          subtotal >= 0 ? 10 : 0,
          taxAmount >= 0 ? 8 : 0,
          paymentMethod ? 8 : 0,
          businessNumber ? 14 : 0,
          confidenceScore >= 70 ? 8 : confidenceScore >= 40 ? 4 : 0,
        ].reduce((sum, val) => sum + val, 0) - (mathMismatchWarning ? 10 : 0),
      ),
    );

    const lineItemsRaw = result.line_items;
    const lineItems = Array.isArray(lineItemsRaw)
      ? lineItemsRaw.map((item: Record<string, unknown>) => ({
          description: String(item.description ?? ''),
          quantity: Number(item.quantity ?? 1),
          unit_price: Number(item.unit_price ?? item.price ?? 0),
          tax_rate: Number(item.tax_rate ?? 0),
          tax_amount: Number(item.tax_amount ?? 0),
          category: String(item.category ?? ''),
          line_total: Number(item.line_total ?? 0),
        }))
      : formData.line_items;

    setFormData((prev) => ({
      ...prev,
      vendor_name: String(result.vendor_name ?? ''),
      vendor_address: String(result.vendor_address ?? ''),
      business_number: businessNumber,
      total_amount: totalAmount,
      subtotal,
      tax_amount: taxAmount,
      pst_amount: pstAmount,
      transaction_date: String(result.transaction_date ?? prev.transaction_date),
      transaction_time: String(result.transaction_time ?? ''),
      payment_method: paymentMethod || 'Unknown',
      payment_reference: prev.payment_reference,
      card_last_four: String(result.card_last_four ?? ''),
      category: String(result.category ?? prev.category ?? 'Office/Admin'),
      notes: String(result.notes ?? ''),
      currency: detectedCurrency,
      confidence_score: confidenceScore,
      cra_readiness_score: readinessScore,
      thermal_warning: Boolean(result.thermal_warning),
      document_type: 'receipt',
      duplicate_hash: '',
      math_mismatch_warning: mathMismatchWarning,
      missing_bn_warning: missingBnWarning,
      capture_source: prev.capture_source,
      usage_type: prev.usage_type,
      business_use_percent: prev.business_use_percent,
      job_code: prev.job_code,
      vehicle_id: prev.vehicle_id,
      business_unit_id: prev.business_unit_id,
      paid_by: prev.paid_by,
      reimbursement_status: prev.reimbursement_status,
      approval_status: prev.approval_status,
      exchange_rate: detectedCurrency !== 'CAD' ? prev.exchange_rate : 1.0,
      line_items: lineItems,
    }));
  }

  async function onCapture(file: File) {
    try {
      setNotice(null);

      const rawDataUrl = await readFileAsDataUrl(file);
      const resizedDataUrl = await resizeTo2000px(rawDataUrl, 'image/jpeg');

      setOriginalFileName(file.name);
      setMimeType(file.type || 'image/jpeg');
      setImageSrc(resizedDataUrl);
      setFormData((prev) => ({
        ...createBlankReceiptForm(),
        capture_source: prev.capture_source,
        usage_type: prev.usage_type,
        business_use_percent: prev.business_use_percent,
        business_unit_id: prev.business_unit_id,
      }));
      setShowCropper(true);
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to capture receipt.');
    }
  }

  async function onApplyCroppedImage(cropped: string) {
    try {
      const resized = await resizeTo2000px(cropped, 'image/jpeg');
      setImageSrc(resized);
      setShowCropper(false);
      showNotice('success', 'Crop applied. Ready for AI processing.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to apply crop.');
    }
  }

  async function onProcessAI() {
    if (!imageSrc) {
      showNotice('error', 'Please capture a receipt first.');
      return;
    }

    setProcessingAI(true);
    setNotice(null);

    try {
      const result = await scanReceipt(imageSrc);

      if (!result.success) {
        showNotice('error', result.error);
        return;
      }

      mergeScanData(result.data as unknown as Record<string, unknown>);
      setHasAnalyzed(true);
      showNotice('success', 'Receipt processed successfully. Please review the details below.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI processing failed.';
      showNotice('error', msg);
    } finally {
      setProcessingAI(false);
    }
  }

  async function performSave(skipDuplicateCheck = false) {
    if (!imageSrc) {
      showNotice('error', 'Please capture a receipt before saving.');
      return;
    }

    if (!user?.id) {
      showNotice('error', 'You must be signed in to save receipts.');
      return;
    }

    setSaving(true);
    setNotice(null);

    try {
      const integrityHash = await computeSHA256(imageSrc);
      const duplicateHash = await generateDuplicateHash(
        formData.vendor_name,
        formData.transaction_date,
        formData.total_amount,
      );

      if (!skipDuplicateCheck) {
        const duplicate = await findDuplicateCandidate(
          { ...formData, duplicate_hash: duplicateHash },
          integrityHash,
        );

        if (duplicate) {
          setDuplicateCandidate(duplicate);
          setPendingSave(true);
          setSaving(false);
          return;
        }
      }

      const blob = dataUrlToBlob(imageSrc);
      const extension = mimeType.includes('png') ? 'png' : 'jpg';
      const baseName = normalizeFileName(originalFileName || `${formData.vendor_name || 'receipt'}-${Date.now()}`);
      const storagePath = `${user.id}/${Date.now()}-${baseName}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, blob, {
          cacheControl: '3600',
          contentType: blob.type || 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw new Error(uploadError.message);

      const {
        data: { publicUrl },
      } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

      const payload = toDbPayload(
        { ...formData, duplicate_hash: duplicateHash, duplicate_warning: false },
        publicUrl,
        integrityHash,
      );

      const { error: insertError } = await supabase.from('receipts').insert(payload);

      if (insertError) throw new Error(insertError.message);

      await supabase.from('audit_logs').insert({
        user_id: user?.id ?? 'system',
        action: 'receiptcreated',
        details: `Receipt saved: ${payload.vendor_name} ${payload.transaction_date} ${payload.total_amount.toFixed(2)} SHA256 ${integrityHash.slice(0, 16)}...`,
      });

      setDuplicateCandidate(null);
      setPendingSave(false);
      resetScanner();
      onSaveSuccess();

      showNotice('success', 'Receipt saved successfully.');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to save receipt.';
      showNotice('error', errorMsg);
    } finally {
      setSaving(false);
    }
  }

  async function onSave() {
    await performSave(false);
  }

  async function onContinueDuplicateSave() {
    setDuplicateCandidate(null);
    if (!pendingSave) return;
    setPendingSave(false);
    await performSave(true);
  }

  return (
    <div className="space-y-4 fade-in">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          await onCapture(file);
        }}
      />
      
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          await onCapture(file);
        }}
      />

      {notice && (
        <div
          className={[
            'flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm backdrop-blur-xl',
            notice.tone === 'success' && 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300',
            notice.tone === 'error' && 'border-red-500/20 bg-red-500/[0.06] text-red-300',
            notice.tone === 'info' && 'border-blue-500/20 bg-blue-500/[0.06] text-blue-300',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{notice.message}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-glass-border bg-surface shadow-sm">
        <div className="border-b border-glass-border px-5 py-4">
          <h2 className="text-lg font-bold text-text-primary">Scanner</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Capture, crop, extract, verify, and save a CRA-ready receipt record.
          </p>
        </div>

        <div className="space-y-5 p-5">
          {!imageSrc ? (
            <div className="rounded-3xl border border-dashed border-glass-border-hover bg-surface-raised p-8">
              <div className="mx-auto flex max-w-md flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-champagne/10 text-champagne">
                  <Camera className="h-8 w-8" />
                </div>

                <h3 className="text-base font-bold text-text-primary">Capture a receipt</h3>
                <p className="mt-2 text-sm text-text-secondary">
                  Images are resized to 1600px before AI processing for consistent OCR quality.
                </p>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  {/* Haptic Scan Button with Spring physics */}
                  <motion.button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    whileTap={{ scale: 0.92 }}
                    whileHover={{ scale: 1.03 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-champagne px-5 py-3 text-sm font-semibold text-obsidian shadow-lg shadow-champagne/20 transition hover:bg-champagne-dim"
                  >
                    <Camera className="h-4 w-4" />
                    Use camera
                  </motion.button>

                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-glass-border bg-surface px-5 py-3 text-sm font-semibold text-text-secondary transition hover:bg-surface-raised hover:text-text-primary"
                  >
                    <Upload className="h-4 w-4" />
                    Upload image
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-4 min-w-0">
                  <div className="overflow-hidden rounded-3xl border border-glass-border bg-surface-raised">
                    <div className="flex items-center justify-between border-b border-glass-border bg-surface px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary">Captured image</p>
                        <p className="text-xs text-text-muted truncate">{originalFileName || 'receipt.jpg'}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowCropper(true)}
                          className="rounded-xl border border-glass-border bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition hover:bg-surface-raised hover:text-text-primary"
                        >
                          Crop
                        </button>

                        <button
                          type="button"
                          onClick={resetScanner}
                          className="inline-flex items-center gap-2 rounded-xl border border-glass-border bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition hover:bg-surface-raised hover:text-text-primary"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Reset
                        </button>
                      </div>
                    </div>

                    <div className="bg-obsidian p-3">
                      <img
                        src={imageSrc}
                        alt="Captured receipt"
                        className="max-h-[540px] w-full rounded-2xl object-contain"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <motion.button
                      type="button"
                      onClick={onProcessAI}
                      disabled={!canProcess}
                      whileTap={{ scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-champagne px-5 py-3.5 text-sm font-semibold text-obsidian transition hover:bg-champagne-dim disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {processingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                      {processingAI ? 'Processing with AI…' : 'Process with AI'}
                    </motion.button>
                  </div>

                  <div className="rounded-2xl border border-champagne/15 bg-champagne/[0.04] px-4 py-3 text-xs text-champagne-dim">
                    A SHA-256 integrity hash is generated before upload, and duplicate checking is performed using both
                    the file hash and a vendor/date/amount fingerprint.
                  </div>
                </div>

                <div className="min-w-0">
                  <ScannerForm
                    formData={formData}
                    setFormData={setFormData}
                    businessUnits={businessUnits}
                    saving={saving || processingAI || loadingBusinessUnits}
                    onSave={onSave}
                    hasAnalyzed={hasAnalyzed}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showCropper && imageSrc && (
        <ManualCropper
          imageSrc={imageSrc}
          fileName={originalFileName || 'receipt.jpg'}
          onCancel={() => setShowCropper(false)}
          onApply={onApplyCroppedImage}
        />
      )}

      {duplicateCandidate && (
        <DuplicateModal
          candidate={duplicateCandidate}
          onCancel={() => {
            setDuplicateCandidate(null);
            setPendingSave(false);
            setSaving(false);
          }}
          onContinue={onContinueDuplicateSave}
        />
      )}
    </div>
  );
}