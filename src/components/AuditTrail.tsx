'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Download,
  Edit3,
  Eye,
  FilePlus2,
  Fingerprint,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/ui-utils';
import type { AuditLogRow } from '@/lib/types';

function getActionMeta(action?: string) {
  const normalized = (action ?? '').toLowerCase();

  if (normalized.includes('export')) {
    return {
      label: 'Export',
      icon: <Download className="h-4 w-4" />,
      pill: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
      iconWrap: 'bg-blue-500/15 text-blue-400',
    };
  }

  if (
    normalized.includes('create') ||
    normalized.includes('scan') ||
    normalized.includes('add') ||
    normalized.includes('save')
  ) {
    return {
      label: 'Create',
      icon: <FilePlus2 className="h-4 w-4" />,
      pill: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
      iconWrap: 'bg-emerald-500/15 text-emerald-400',
    };
  }

  if (normalized.includes('edit') || normalized.includes('update')) {
    return {
      label: 'Edit',
      icon: <Edit3 className="h-4 w-4" />,
      pill: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
      iconWrap: 'bg-amber-500/15 text-amber-400',
    };
  }

  if (normalized.includes('delete') || normalized.includes('remove')) {
    return {
      label: 'Delete',
      icon: <Trash2 className="h-4 w-4" />,
      pill: 'bg-red-500/15 text-red-400 border-red-500/20',
      iconWrap: 'bg-red-500/15 text-red-400',
    };
  }

  if (normalized.includes('view') || normalized.includes('open')) {
    return {
      label: 'View',
      icon: <Eye className="h-4 w-4" />,
      pill: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
      iconWrap: 'bg-violet-500/15 text-violet-400',
    };
  }

  return {
    label: 'Integrity',
    icon: <Fingerprint className="h-4 w-4" />,
    pill: 'bg-white/5 text-text-secondary border-glass-border',
    iconWrap: 'bg-white/5 text-text-secondary',
  };
}

export default function AuditTrail() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const loadLogs = async () => {
    setLoading(true);
    setError('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        setLogs([]);
        setError('You must be signed in to view the audit trail.');
        return;
      }

      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      setLogs((data ?? []) as AuditLogRow[]);
    } catch (err: any) {
      setLogs([]);
      setError(err?.message || 'Failed to load audit trail.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Audit Trail</h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            View key record events, exports, and integrity-related actions.
          </p>
        </div>

        <button
          type="button"
          onClick={loadLogs}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-glass-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary shadow-sm transition hover:border-glass-border-hover hover:text-champagne disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="rounded-2xl border border-champagne/15 bg-champagne/[0.04] p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-champagne" />
          <div>
            <p className="text-sm font-semibold text-text-primary">Compliance record view</p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              This screen helps show who did what and when, including export activity and saved receipt events.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-3xl border border-glass-border bg-surface">
          <Loader2 className="h-8 w-8 animate-spin text-champagne" />
          <p className="text-sm font-medium text-text-secondary">Loading audit events…</p>
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-red-500/20 bg-red-500/[0.06] p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" />
            <div>
              <p className="text-sm font-semibold text-red-300">Could not load audit trail</p>
              <p className="mt-1 text-sm text-red-400">{error}</p>
            </div>
          </div>
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-3xl border border-glass-border bg-surface p-12 text-center shadow-sm">
          <ShieldCheck className="mx-auto mb-3 h-12 w-12 text-text-muted/30" />
          <p className="text-sm font-medium text-text-secondary">
            No audit events yet. Actions like saving or exporting receipts will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const meta = getActionMeta(log.action);

            return (
              <div
                key={log.id}
                className="rounded-2xl border border-glass-border bg-surface p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${meta.iconWrap}`}
                  >
                    {meta.icon}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-text-primary">
                        {log.action || 'Unknown action'}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.pill}`}
                      >
                        {meta.label}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-text-muted">
                      {formatDate(log.created_at)}
                    </p>

                    {log.details && (
                      <p className="mt-3 text-sm leading-6 text-text-secondary">
                        {log.details}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}