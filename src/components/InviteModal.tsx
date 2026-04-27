'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { generateAccessCode } from '@/lib/services/receipts';
import type { UserRole } from '@/lib/types';

interface InviteModalProps {
  onClose: () => void;
  businessUnits: { id: string; name: string }[];
}

export default function InviteModal({ onClose, businessUnits }: InviteModalProps) {
  const [role, setRole] = useState<UserRole>('Employee');
  const [businessUnitId, setBusinessUnitId] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setGeneratedCode(null);
    try {
      const code = await generateAccessCode(role, businessUnitId || undefined);
      setGeneratedCode(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate code.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedCode) return;
    await navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          className="w-full max-w-md rounded-[2.5rem] border border-glass-border bg-surface p-8 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="mb-8 flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-champagne/15 text-champagne champagne-glow">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-text-primary">Invite Team Member</h2>
                <p className="mt-1 text-sm text-text-secondary">Generate a 6-digit single-use access code.</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-text-muted transition hover:bg-surface-raised hover:text-text-primary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Role Selector */}
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-champagne">
                Role to Assign
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Employee', 'Accountant'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={[
                      'rounded-2xl border py-3 text-sm font-semibold transition',
                      role === r
                        ? 'border-champagne/40 bg-champagne/10 text-champagne'
                        : 'border-glass-border bg-surface-raised text-text-secondary hover:border-glass-border-hover',
                    ].join(' ')}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Business Unit (optional) */}
            {businessUnits.length > 0 && (
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                  Business Unit (Optional)
                </label>
                <select
                  value={businessUnitId}
                  onChange={(e) => setBusinessUnitId(e.target.value)}
                  className="w-full rounded-2xl border border-glass-border bg-surface-raised px-4 py-3 text-sm text-text-primary outline-none focus:border-champagne/40"
                >
                  <option value="">No specific unit</option>
                  {businessUnits.map((bu) => (
                    <option key={bu.id} value={bu.id}>{bu.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="rounded-xl bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>
            )}

            {/* Generated Code Display */}
            {generatedCode && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-3xl border border-champagne/30 bg-champagne/[0.05] p-5 text-center"
              >
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-champagne/70">
                  Invite Code — Expires in 24h
                </p>
                <p className="text-5xl font-black tracking-[0.4em] text-champagne">{generatedCode}</p>
                <button
                  onClick={handleCopy}
                  className={[
                    'mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition',
                    copied
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-surface-raised text-text-secondary hover:text-text-primary',
                  ].join(' ')}
                >
                  <Copy className="h-4 w-4" />
                  {copied ? 'Copied!' : 'Copy Code'}
                </button>
                <p className="mt-3 text-xs text-text-muted">
                  Share this code with your team member. It can only be used once.
                </p>
              </motion.div>
            )}

            {/* Generate / Regenerate Button */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-[2rem] bg-champagne text-base font-black text-obsidian shadow-xl shadow-champagne/20 transition hover:bg-champagne-dim disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : generatedCode ? (
                <RefreshCw className="h-5 w-5" />
              ) : (
                <ShieldCheck className="h-5 w-5" />
              )}
              {loading ? 'Generating…' : generatedCode ? 'Generate New Code' : 'Generate Code'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
