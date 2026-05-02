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
        
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 4096 },
            height: { ideal: 2160 },
          },
          audio: false
        };

        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
        }
        
        setStream(newStream);

        // Check for flash support (torch)
        const track = newStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        if (capabilities.torch) {
          setHasFlash(true);
        }
      } catch (err) {
        console.error('Camera access error:', err);
        setError('Could not access camera. Please check permissions.');
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
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex flex-col bg-black"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 relative z-10">
        <button 
          onClick={onClose}
          className="p-2 rounded-full bg-black/40 text-white backdrop-blur-md transition hover:bg-black/60"
        >
          <X className="h-6 w-6" />
        </button>
        
        {hasFlash && (
          <button 
            onClick={toggleFlash}
            className={`p-2 rounded-full backdrop-blur-md transition ${isFlashOn ? 'bg-champagne text-obsidian' : 'bg-black/40 text-white'}`}
          >
            {isFlashOn ? <Zap className="h-6 w-6" /> : <ZapOff className="h-6 w-6" />}
          </button>
        )}
      </div>

      {/* Video Feed Container */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {isStarting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60">
            <RefreshCcw className="h-10 w-10 animate-spin mb-4" />
            <p className="text-sm font-medium">Initializing High-Res Lens...</p>
          </div>
        )}
        
        {error ? (
          <div className="p-8 text-center text-white">
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
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        )}
        
        {/* Overlay Guides */}
        <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40 sm:border-[80px]">
          <div className="h-full w-full border-2 border-white/20 rounded-2xl relative">
             {/* Corner brackets */}
             <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-champagne rounded-tl-lg" />
             <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-champagne rounded-tr-lg" />
             <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-champagne rounded-bl-lg" />
             <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-champagne rounded-br-lg" />
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="p-8 flex items-center justify-center gap-12 bg-gradient-to-t from-black to-transparent">
        <div className="w-12 h-12" /> {/* Spacer */}
        
        <button 
          onClick={takePhoto}
          disabled={isStarting || !!error}
          className="relative group p-1"
        >
          <div className="h-20 w-20 rounded-full border-4 border-white flex items-center justify-center transition group-active:scale-90">
             <div className="h-16 w-16 rounded-full bg-white transition group-hover:scale-95" />
          </div>
          {/* Subtle outer ring animation */}
          <motion.div 
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 border-2 border-champagne/30 rounded-full pointer-events-none"
          />
        </button>

        <div className="w-12 h-12" /> {/* Spacer */}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </motion.div>
  );
}
