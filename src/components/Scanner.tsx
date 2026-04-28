'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Camera, Loader2, RefreshCw, ScanLine, Upload, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import JSZip from 'jszip';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';

import { scanReceipt, generateEmbedding } from '@/app/actions/scan-receipt';
import { generateDuplicateHash, generateIntegrityHash } from '@/lib/hash';
import { supabase } from '@/lib/supabase';
import { saveReceipt } from '@/lib/services/receipts';

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
const BATCH_LIMIT = 50;
const BLUR_THRESHOLD = 80; // Laplacian variance — below this = blurry

/** Laplacian variance blur detection via greyscale canvas convolution */
async function computeBlurScore(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(999); return; }
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      // Convert to greyscale
      const grey: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        grey.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      // Laplacian kernel: [0,1,0,1,-4,1,0,1,0]
      let sumSq = 0;
      let count = 0;
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          const idx = y * size + x;
          const lap =
            grey[idx - size] +
            grey[idx + size] +
            grey[idx - 1] +
            grey[idx + 1] -
            4 * grey[idx];
          sumSq += lap * lap;
          count++;
        }
      }
      resolve(count > 0 ? sumSq / count : 999);
    };
    img.onerror = () => resolve(999);
    img.src = dataUrl;
  });
}

export default function Scanner({ user, onSaveSuccess }: ScannerProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const formContainerRef = useRef<HTMLDivElement | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

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

  // Batch / JSZip Engine State
  const [batchQueue, setBatchQueue] = useState<File[]>([]);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchProgress, setBatchProgress] = useState(0);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // Blur detection state
  const [blurScore, setBlurScore] = useState<number | null>(null);
  const [showBlurWarning, setShowBlurWarning] = useState(false);

  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveMutation = useMutation({
    mutationFn: async ({ bypassCheck, localFormData }: { bypassCheck: boolean, localFormData: ReceiptForm }) => {
      if (!user) throw new Error('You must be logged in to save.');

      const computedHash = await generateDuplicateHash(localFormData.vendor_name, localFormData.transaction_date, localFormData.total_amount);

      if (!bypassCheck && duplicateCandidate === null) {
        const { data: duplicates, error: dupCheckError } = await supabase
          .from('receipts')
          .select('id, created_at, vendor_name, total_amount')
          .eq('duplicate_hash', computedHash)
          .eq('user_id', user.id);

        if (dupCheckError) throw dupCheckError;
        if (duplicates && duplicates.length > 0) {
          setDuplicateCandidate(duplicates[0] as ReceiptRow);
          return { needsConfirmation: true };
        }
      }

      let imageUrl: string | null = null;
      let integrityHash = '';

      // Upload image to Supabase Storage and compute hash
      if (imageSrc) {
        try {
          const response = await fetch(imageSrc);
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          integrityHash = await generateIntegrityHash(arrayBuffer);

          const filePath = `${user.id}/${Date.now()}-receipt.jpg`;
          const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(filePath, blob, { contentType: 'image/jpeg' });

          if (!uploadError) {
            const { data: urlData } = supabase.storage
              .from(STORAGE_BUCKET)
              .getPublicUrl(filePath);
            imageUrl = urlData?.publicUrl ?? null;
          }
        } catch {
          // Image upload is non-blocking — continue saving without image
        }
      }

      if (!integrityHash) {
        // Fallback hash if no image
        integrityHash = await generateIntegrityHash(new TextEncoder().encode(JSON.stringify(localFormData)).buffer);
      }

      const aiEmbedding = await generateEmbedding(JSON.stringify(localFormData));

      let payload = {
        ...localFormData,
        user_id: user.id,
        duplicate_hash: computedHash,
        duplicate_warning: bypassCheck && Boolean(duplicateCandidate),
        image_url: imageUrl,
        semantic_embedding: aiEmbedding,
      } as Record<string, unknown>;

      await saveReceipt(payload, integrityHash, user.id);

      return { success: true };
    },
    onSuccess: (result) => {
      if (result?.needsConfirmation) return;
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      setDuplicateCandidate(null);
      setPendingSave(false);
      
      if (!isBatchProcessing) {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#dfcaaa', '#be9e71', '#10b981', '#3b82f6']
        });
        resetScanner();
        onSaveSuccess();
        showNotice('success', 'Receipt saved successfully.');
      } else {
        setImageSrc(null);
        setFormData(createBlankReceiptForm());
      }
    },
    onError: (error: Error) => {
      setSqlError(error.message || 'A critical database error occurred.');
    },
    onSettled: () => {
      setSaving(false);
    }
  });

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
    setIsBatchProcessing(false);
    setBatchQueue([]);
    setBatchTotal(0);
    setBatchProgress(0);

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
      fraud_suspicion: Boolean(result.fraud_suspicion),
      fraud_reason: String(result.fraud_reason ?? ''),
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
      setShowBlurWarning(false);

      const rawDataUrl = await readFileAsDataUrl(file);
      const resizedDataUrl = await resizeTo2000px(rawDataUrl, 'image/jpeg');

      // Blur detection before showing cropper
      const score = await computeBlurScore(resizedDataUrl);
      setBlurScore(score);

      if (score < BLUR_THRESHOLD && !isBatchProcessing) {
        setShowBlurWarning(true);
        setImageSrc(resizedDataUrl); // still set so user can see it
        setOriginalFileName(file.name);
        setMimeType(file.type || 'image/jpeg');
        // Don't open cropper yet — let user decide
        return;
      }

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
      showNotice('info', 'AI Extraction starting...');
      
      // Auto-trigger AI to fix the loop and advance state
      setTimeout(() => {
        onProcessAI(resized);
      }, 50);
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to apply crop.');
    }
  }

  async function onProcessAI(explicitSrc?: string, source: string = 'camera') {
    const srcToUse = explicitSrc || imageSrc;
    if (!srcToUse) {
      showNotice('error', 'Please capture a receipt first.');
      return;
    }

    setProcessingAI(true);
    setNotice(null);

    try {
      const result = await scanReceipt(srcToUse, source);

      if (!result.success) {
        showNotice('error', result.error);
        if (isBatchProcessing) {
          setTimeout(processNextBatchItem, 1000);
        }
        return;
      }

      mergeScanData(result.data as unknown as Record<string, unknown>);
      setHasAnalyzed(true);
      showNotice('success', 'Receipt processed successfully. Please review the details below.');
      
      // Auto-scroll to form top
      setTimeout(() => {
        formContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      
      if (isBatchProcessing) {
        await performSave(true);
        setTimeout(processNextBatchItem, 1000);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI processing failed.';
      showNotice('error', msg);
    } finally {
      setProcessingAI(false);
    }
  }

  async function performSave(bypassCheck = false, finalFormData?: ReceiptForm) {
    if (saving || (!imageSrc && batchQueue.length === 0)) return;
    setSaving(true);
    setNotice(null);

    const payload = finalFormData || formData;
    saveMutation.mutate({ bypassCheck, localFormData: payload });
  }

  async function onSave() {
    await performSave(false);
  }

  async function onContinueDuplicateSave() {
    await performSave(true);
  }

  async function processNextBatchItem() {
    setBatchQueue(prev => {
      if (prev.length === 0) {
        setIsBatchProcessing(false);
        setBatchTotal(0);
        setBatchProgress(0);
        showNotice('success', 'Batch processing completed.');
        onSaveSuccess();
        return [];
      }
      
      const nextFile = prev[0];
      const remaining = prev.slice(1);
      
      setBatchProgress(batchTotal - remaining.length);
      
      onCapture(nextFile).then(() => {
        setTimeout(() => {
          onProcessAI();
        }, 1500);
      });
      
      return remaining;
    });
  }

  async function handleFilesSelected(filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return;
    
    let processedFiles: File[] = [];

    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      
      if (file.name.toLowerCase().endsWith('.zip')) {
        try {
          const zip = new JSZip();
          const contents = await zip.loadAsync(file);
          
          for (const [relativePath, zipEntry] of Object.entries(contents.files)) {
            if (!zipEntry.dir && relativePath.match(/\.(jpe?g|png)$/i)) {
              const blob = await zipEntry.async('blob');
              processedFiles.push(new File([blob], zipEntry.name, { type: blob.type || 'image/jpeg' }));
            }
          }
        } catch (error) {
          showNotice('error', `Failed to parse ZIP file: ${file.name}`);
        }
      } else if (file.type.startsWith('image/')) {
        processedFiles.push(file);
      }
    }

    if (processedFiles.length > BATCH_LIMIT) {
      showNotice('info', `Batch limit is ${BATCH_LIMIT} files. Only the first ${BATCH_LIMIT} will be processed.`);
      processedFiles = processedFiles.slice(0, BATCH_LIMIT);
    }

    if (processedFiles.length === 0) {
      showNotice('error', 'No valid image files found to process.');
      return;
    }

    if (processedFiles.length === 1) {
      await onCapture(processedFiles[0]);
    } else {
      setBatchTotal(processedFiles.length);
      setBatchProgress(1);
      setIsBatchProcessing(true);
      setBatchQueue(processedFiles);
      
      const firstFile = processedFiles[0];
      setBatchQueue(processedFiles.slice(1));
      
      onCapture(firstFile).then(() => {
        setTimeout(() => onProcessAI(), 1500);
      });
    }
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
          await handleFilesSelected(event.target.files);
          if (cameraInputRef.current) cameraInputRef.current.value = '';
        }}
      />
      
      <input
        ref={galleryInputRef}
        type="file"
        multiple
        accept="image/*,.zip,application/pdf"
        className="hidden"
        onChange={async (event) => {
          await handleFilesSelected(event.target.files);
          if (galleryInputRef.current) galleryInputRef.current.value = '';
        }}
      />

      <input
        ref={screenshotInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file) {
            await onCapture(file);
            setFormData(prev => ({ ...prev, capture_source: 'email_screenshot' }));
            setTimeout(() => onProcessAI(undefined, 'email_screenshot'), 500);
          }
          if (screenshotInputRef.current) screenshotInputRef.current.value = '';
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

      {/* Blur Warning Banner */}
      <AnimatePresence>
        {showBlurWarning && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-300">Image Quality Warning</p>
                <p className="mt-1 text-xs text-amber-400/80">
                  This image appears blurry (score: {Math.round(blurScore ?? 0)}). CRA requires legible receipts for ITC claims. Retake for best results.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowBlurWarning(false); cameraInputRef.current?.click(); }}
                    className="rounded-xl bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-400 transition hover:bg-amber-500/25"
                  >
                    Retake Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBlurWarning(false);
                      setFormData(prev => ({ ...createBlankReceiptForm(), capture_source: prev.capture_source, usage_type: prev.usage_type, business_use_percent: prev.business_use_percent, business_unit_id: prev.business_unit_id }));
                      setShowCropper(true);
                    }}
                    className="rounded-xl bg-surface-raised px-3 py-1.5 text-xs font-semibold text-text-secondary transition hover:text-text-primary"
                  >
                    Use Anyway
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="overflow-hidden rounded-3xl border border-glass-border bg-surface shadow-sm">
        <div className="border-b border-glass-border px-5 py-4">
          <h2 className="text-lg font-bold text-text-primary">9 Star Labs Scanner</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Capture, crop, extract, verify, and save a CRA-ready receipt record. Up to {BATCH_LIMIT} files per batch.
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

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <motion.button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    whileTap={{ scale: 0.92 }}
                    whileHover={{ scale: 1.03 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-champagne px-4 py-3 text-sm font-semibold text-obsidian shadow-lg shadow-champagne/20 transition hover:bg-champagne-dim"
                  >
                    <Camera className="h-4 w-4" />
                    Camera
                  </motion.button>

                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-glass-border bg-surface px-4 py-3 text-sm font-semibold text-text-secondary transition hover:bg-surface-raised hover:text-text-primary"
                  >
                    <Upload className="h-4 w-4" />
                    Upload
                  </button>

                  <button
                    type="button"
                    onClick={() => screenshotInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-glass-border bg-surface px-4 py-3 text-sm font-semibold text-text-secondary transition hover:bg-surface-raised hover:text-text-primary"
                  >
                    <ScanLine className="h-4 w-4" />
                    Screenshot
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {isBatchProcessing && (
                <div className="mb-4 overflow-hidden rounded-2xl border border-[#dfcaaa]/30 bg-obsidian shadow-[0_0_20px_rgba(190,169,142,0.1)]">
                  <div className="relative px-5 py-3">
                    <div className="flex items-center gap-3 relative z-10">
                      <Layers className="h-5 w-5 animate-pulse text-champagne" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-champagne">GALAXY Extraction Engine Active</p>
                        <p className="text-xs text-champagne/80">
                          Processing {batchProgress} of {batchTotal}...
                        </p>
                      </div>
                      <Loader2 className="h-4 w-4 animate-spin text-champagne" />
                    </div>
                    <div className="absolute top-0 left-0 h-full bg-champagne/10 transition-all duration-700 ease-in-out" style={{ width: `${(Math.max(1, batchProgress) / batchTotal) * 100}%` }} />
                  </div>
                </div>
              )}

              <div className="grid h-full gap-6 lg:grid-cols-2">
                {/* Image Section */}
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-[2.5rem] border border-glass-border bg-surface shadow-lg">
                    <div className="flex items-center justify-between border-b border-glass-border bg-surface-raised/50 px-6 py-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-text-muted">Digital Capture</p>
                        <p className="mt-0.5 text-sm font-bold text-text-primary truncate max-w-[150px] sm:max-w-none">{originalFileName || 'receipt.jpg'}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowCropper(true)}
                          className="rounded-xl border border-glass-border bg-surface px-4 py-2 text-xs font-bold text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
                        >
                          Crop
                        </button>
                        <button
                          type="button"
                          onClick={resetScanner}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-glass-border bg-surface text-text-secondary transition hover:bg-surface-hover hover:text-red-400"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="relative bg-obsidian group">
                      <img
                        src={imageSrc}
                        alt="Captured receipt"
                        className="max-h-[60vh] w-full object-contain transition-transform duration-700 group-hover:scale-[1.01] sm:max-h-[70vh]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-obsidian/20 to-transparent pointer-events-none" />
                    </div>
                  </div>

                  <motion.button
                    type="button"
                    onClick={() => onProcessAI()}
                    disabled={!canProcess}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    className={`inline-flex w-full items-center justify-center gap-3 rounded-[1.5rem] bg-champagne py-4 text-sm font-black uppercase tracking-[0.15em] text-obsidian transition hover:bg-champagne-dim shadow-xl shadow-champagne/10 disabled:cursor-not-allowed disabled:opacity-40 ${!hasAnalyzed ? 'glowing-border' : ''}`}
                  >
                    {processingAI ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
                    {processingAI ? 'AI Analysis in Progress...' : 'Start AI Analysis'}
                  </motion.button>
                </div>

                {/* Form Section */}
                <div 
                  ref={formContainerRef} 
                  className="min-w-0 rounded-[2.5rem] bg-surface-raised/30 p-1 lg:overflow-y-auto lg:max-h-[calc(100vh-10rem)] no-scrollbar"
                >
                  <div className="p-1">
                    <ScannerForm
                      formData={formData}
                      setFormData={setFormData}
                      businessUnits={businessUnits}
                      saving={saving || processingAI || loadingBusinessUnits}
                      onSave={() => performSave(false, formData)}
                      hasAnalyzed={hasAnalyzed}
                    />
                  </div>
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
      <AnimatePresence>
        {sqlError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md rounded-[2.5rem] border border-red-500/30 bg-surface p-8 shadow-2xl"
            >
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-red-500/10 text-red-500">
                <AlertCircle className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-text-primary">Database Integrity Error</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                The vault rejected this entry. This usually happens if a required field is malformed or a connection was interrupted.
              </p>
              <div className="mt-6 rounded-2xl bg-red-500/[0.05] p-4 font-mono text-xs text-red-400 border border-red-500/10 overflow-x-auto">
                {sqlError}
              </div>
              <button
                onClick={() => setSqlError(null)}
                className="mt-8 w-full rounded-2xl bg-surface-raised py-4 text-sm font-bold text-text-primary transition hover:bg-surface-hover"
              >
                Dismiss & Correct
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}