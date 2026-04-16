'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crop, RotateCcw, X } from 'lucide-react';

import type { CropRect, ManualCropperProps } from './types';

type DragMode = 'new' | 'move' | null;

export default function ManualCropper({ imageSrc, fileName, onCancel, onApply }: ManualCropperProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const [imageBounds, setImageBounds] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState<CropRect | null>(null);

  const dragState = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    originCrop: CropRect | null;
  }>({
    mode: null,
    startX: 0,
    startY: 0,
    originCrop: null,
  });

  useEffect(() => {
    setCrop(null);
  }, [imageSrc]);

  function syncBounds() {
    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setImageBounds({
      width: rect.width,
      height: rect.height,
    });
  }

  function clampRect(next: CropRect): CropRect {
    const width = Math.max(20, Math.min(next.width, imageBounds.width));
    const height = Math.max(20, Math.min(next.height, imageBounds.height));
    const x = Math.max(0, Math.min(next.x, imageBounds.width - width));
    const y = Math.max(0, Math.min(next.y, imageBounds.height - height));

    return { x, y, width, height };
  }

  function getPoint(clientX: number, clientY: number) {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return null;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!overlayRef.current) return;

    const point = getPoint(event.clientX, event.clientY);
    if (!point) return;

    const isInsideExisting =
      crop &&
      point.x >= crop.x &&
      point.x <= crop.x + crop.width &&
      point.y >= crop.y &&
      point.y <= crop.y + crop.height;

    dragState.current = {
      mode: isInsideExisting ? 'move' : 'new',
      startX: point.x,
      startY: point.y,
      originCrop: crop,
    };

    if (!isInsideExisting) {
      const starter = clampRect({
        x: point.x,
        y: point.y,
        width: 20,
        height: 20,
      });
      setCrop(starter);
    }

    overlayRef.current.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const mode = dragState.current.mode;
    if (!mode) return;

    const point = getPoint(event.clientX, event.clientY);
    if (!point) return;

    if (mode === 'new') {
      const startX = dragState.current.startX;
      const startY = dragState.current.startY;

      const next: CropRect = {
        x: Math.min(startX, point.x),
        y: Math.min(startY, point.y),
        width: Math.abs(point.x - startX),
        height: Math.abs(point.y - startY),
      };

      setCrop(clampRect(next));
      return;
    }

    if (mode === 'move' && dragState.current.originCrop) {
      const dx = point.x - dragState.current.startX;
      const dy = point.y - dragState.current.startY;

      const next: CropRect = {
        ...dragState.current.originCrop,
        x: dragState.current.originCrop.x + dx,
        y: dragState.current.originCrop.y + dy,
      };

      setCrop(clampRect(next));
    }
  }

  function stopDragging(event?: React.PointerEvent<HTMLDivElement>) {
    if (event && overlayRef.current?.hasPointerCapture(event.pointerId)) {
      overlayRef.current.releasePointerCapture(event.pointerId);
    }

    dragState.current.mode = null;
  }

  async function applyCrop() {
    if (!crop || !imageRef.current) return;

    const img = imageRef.current;
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;

    const scaleX = naturalWidth / imageBounds.width;
    const scaleY = naturalHeight / imageBounds.height;

    const sourceX = Math.round(crop.x * scaleX);
    const sourceY = Math.round(crop.y * scaleY);
    const sourceWidth = Math.round(crop.width * scaleX);
    const sourceHeight = Math.round(crop.height * scaleY);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, sourceWidth);
    canvas.height = Math.max(1, sourceHeight);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      img,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    onApply(croppedDataUrl);
  }

  const cropStyle = useMemo(() => {
    if (!crop) return undefined;
    return {
      left: `${crop.x}px`,
      top: `${crop.y}px`,
      width: `${crop.width}px`,
      height: `${crop.height}px`,
    };
  }, [crop]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-obsidian/80 p-4 backdrop-blur-xl"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-5xl overflow-hidden rounded-3xl border border-glass-border bg-surface text-text-primary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-glass-border px-5 py-4">
          <div>
            <h3 className="text-base font-bold">Manual crop</h3>
            <p className="mt-1 text-sm text-text-muted">{fileName}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCrop(null)}
              className="inline-flex items-center gap-2 rounded-xl border border-glass-border bg-surface-raised px-3 py-2 text-sm font-semibold text-text-secondary transition hover:bg-surface-hover"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>

            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-2 rounded-xl border border-glass-border bg-surface-raised px-3 py-2 text-sm font-semibold text-text-secondary transition hover:bg-surface-hover"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>

            <button
              type="button"
              onClick={applyCrop}
              disabled={!crop}
              className="inline-flex items-center gap-2 rounded-xl bg-champagne px-3 py-2 text-sm font-semibold text-obsidian transition hover:bg-champagne-dim disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Apply crop
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-glass-border bg-surface-raised px-4 py-3 text-sm text-text-secondary">
            Drag to create a crop box. Drag inside the box to move it. Click <span className="font-semibold text-champagne">Apply crop</span> to return the cropped data URL.
          </div>

          <div
            ref={overlayRef}
            className="relative mx-auto w-full overflow-hidden rounded-2xl border border-glass-border bg-obsidian"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
            onPointerLeave={stopDragging}
            style={{ touchAction: 'none' }}
          >
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Crop source"
              className="max-h-[72vh] w-full object-contain"
              onLoad={syncBounds}
            />

            <div className="pointer-events-none absolute inset-0 bg-black/35" />

            {crop && (
              <div
                className="pointer-events-none absolute border-2 border-champagne bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                style={cropStyle}
              >
                <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-champagne/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-obsidian">
                  <Crop className="h-3 w-3" />
                  Crop
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}