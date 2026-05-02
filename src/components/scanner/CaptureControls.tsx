import { Camera, Upload, ScanLine } from 'lucide-react';
import { motion } from 'framer-motion';

interface CaptureControlsProps {
  onCameraClick: () => void;
  onUploadClick: () => void;
  onScreenshotClick: () => void;
  batchLimit: number;
  maxDimension: number;
}

export default function CaptureControls({ 
  onCameraClick, 
  onUploadClick, 
  onScreenshotClick,
  batchLimit,
  maxDimension
}: CaptureControlsProps) {
  return (
    <div className="rounded-3xl border border-dashed border-glass-border-hover bg-surface-raised p-8">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-champagne/10 text-champagne">
          <Camera className="h-8 w-8" />
        </div>

        <h3 className="text-base font-bold text-text-primary">Capture a receipt</h3>
        <p className="mt-2 text-sm text-text-secondary">
          Images are resized to {maxDimension}px before AI processing for consistent OCR quality.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <motion.button
            type="button"
            onClick={onCameraClick}
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
            onClick={onUploadClick}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-glass-border bg-surface px-4 py-3 text-sm font-semibold text-text-secondary transition hover:bg-surface-raised hover:text-text-primary"
          >
            <Upload className="h-4 w-4" />
            Upload
          </button>

          <button
            type="button"
            onClick={onScreenshotClick}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-glass-border bg-surface px-4 py-3 text-sm font-semibold text-text-secondary transition hover:bg-surface-raised hover:text-text-primary"
          >
            <ScanLine className="h-4 w-4" />
            Screenshot
          </button>
        </div>
        
        {batchLimit > 1 && (
          <p className="mt-4 text-[11px] text-text-muted">
            Batch mode enabled: up to {batchLimit} files per session.
          </p>
        )}
      </div>
    </div>
  );
}
