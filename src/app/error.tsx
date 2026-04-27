'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('CRITICAL_APP_ERROR:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-obsidian p-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md rounded-[2.5rem] border border-red-500/20 bg-red-500/[0.03] p-10 shadow-2xl backdrop-blur-xl"
      >
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-red-500/10 text-red-400 mb-8">
          <AlertTriangle className="h-10 w-10" />
        </div>
        
        <h1 className="text-2xl font-bold tracking-tight text-white">Something went wrong</h1>
        <p className="mt-4 text-sm leading-relaxed text-text-secondary">
          We encountered a critical error while loading the workspace. This is often due to a database synchronization issue or a temporary connection failure.
        </p>

        <div className="mt-6 rounded-2xl bg-black/40 p-4 text-left font-mono text-[10px] text-red-400/80 border border-red-500/10 overflow-auto max-h-32">
          {error.message || 'Unknown runtime error'}
          {error.digest && <div className="mt-2 text-white/20">Digest: {error.digest}</div>}
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4">
          <button
            onClick={() => reset()}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            <RefreshCcw className="h-4 w-4" />
            Try again
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="flex items-center justify-center gap-2 rounded-2xl bg-champagne px-4 py-3 text-sm font-bold text-black transition hover:opacity-90"
          >
            <Home className="h-4 w-4" />
            Home
          </button>
        </div>
      </motion.div>
    </div>
  );
}
