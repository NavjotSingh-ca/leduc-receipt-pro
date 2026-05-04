'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X, Zap, ZapOff, RefreshCcw, Circle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CameraEngineProps } from './types';

export default function CameraEngine({ onCapture, onClose }: CameraEngineProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function startCamera() {
      try {
        setIsStarting(true);
        setError(null);
        
        // Request full device camera with highest quality
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment', // Back camera on mobile
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            aspectRatio: { ideal: 4 / 3 }
          },
          audio: false
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Force full resolution playback
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(err => console.error('Video play error:', err));
          };
        }
        setStream(stream);

        // Check for flash support (torch)
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        if (capabilities.torch) {
          setHasFlash(true);
        }
      } catch (err) {
        console.error('Camera access error:', err);
        setError('Camera access denied. Please check permissions.');
      } finally {
        setIsStarting(false);
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const toggleFlash = async () => {
    if (!stream || !hasFlash) return;
    
    try {
      const track = stream.getVideoTracks()[0];
      const nextFlashState = !isFlashOn;
      await track.applyConstraints({
        advanced: [{ torch: nextFlashState }] as any
      });
      setIsFlashOn(nextFlashState);
    } catch (err) {
      console.error('Flash error:', err);
    }
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas size to match video resolution
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw the current video frame to the canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to file
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
      }
    }, 'image/jpeg', 0.95);
  };

  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col">
      {/* Header with close button */}
      <div className="bg-black text-white p-4 flex justify-between items-center border-b border-white/10">
        <h2 className="text-lg font-semibold">Take Photo</h2>
        <button
          onClick={onClose}
          className="text-2xl leading-none hover:text-gray-300"
          aria-label="Close camera"
        >
          ✕
        </button>
      </div>

      {/* Camera Area */}
      <div className="flex-1 flex flex-col items-center justify-center bg-black overflow-hidden relative">
        {isStarting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60 z-10">
            <RefreshCcw className="h-10 w-10 animate-spin mb-4" />
            <p className="text-sm font-medium">Initializing Lens...</p>
          </div>
        )}

        {error ? (
          <div className="p-8 text-center text-white z-10">
            <p className="text-red-400 mb-4">{error}</p>
            <button 
              onClick={onClose}
              className="px-6 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition"
            >
              Go Back
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            autoPlay
            muted
          />
        )}
      </div>

      {/* Controls - at bottom */}
      <div className="bg-black text-white p-8 flex gap-4 justify-center flex-wrap border-t border-white/10">
        <button
          onClick={takePhoto}
          disabled={isStarting || !!error}
          className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-full flex-1 min-w-max text-sm font-bold uppercase tracking-widest transition-all active:scale-95"
        >
          Capture
        </button>
        <button
          onClick={onClose}
          className="bg-gray-800 hover:bg-gray-700 px-8 py-3 rounded-full flex-1 min-w-max text-sm font-bold uppercase tracking-widest transition-all"
        >
          Cancel
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
