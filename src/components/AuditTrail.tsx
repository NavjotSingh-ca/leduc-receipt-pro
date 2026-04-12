'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Download,
  Eye,
  FilePlus2,
  Fingerprint,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type AuditLogRow = {
  id: string;
  userid?: string;
  action?: string;
  details?: string;
  createdat?: string;
  created_at?: string;
};

function getCreatedAt(log: AuditLogRow): string {
  return log.createdat ?? log.created_at ?? '';
}

function formatDateTime(value?: string): string {
  if (!value) return 'Unknown time';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getActionMeta(action?: string) {
  const normalized = (action ?? '').toLowerCase();

  if (normalized.includes('export')) {
    return {
      label: 'Export',
      icon: <Download className="h-4 w-4" />,
      pill: 'bg-blue-50 text-blue-700 border-blue-200',
      iconWrap: 'bg-blue-100 text-blue-600',
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
      pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      iconWrap: 'bg-emerald-100 text-emerald-600',
    };
  }

  if (normalized.includes('delete') || normalized.includes('remove')) {
    return {
      label: 'Delete',
      icon: <Trash2 className="h-4 w-4" />,
      pill: 'bg-red-50 text-red-700 border-red-200',
      iconWrap: 'bg-red-100 text-red-600',
    };
  }

  if (normalized.includes('view') || normalized.includes('open')) {
    return {
      label: 'View',
      icon: <Eye className="h-4 w-4" />,
      pill: 'bg-violet-50 text-violet-700 border-violet-200',
      iconWrap: 'bg-violet-100 text-violet-600',
    };
  }

  return {
    label: 'Integrity',
    icon: <Fingerprint className="h-4 w-4" />,
    pill: 'bg-slate-100 text-slate-700 border-slate-200',
    iconWrap: 'bg-slate-200 text-slate-700',
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
        .from('auditlogs')
        .select('*')
        .eq('userid', session.user.id)
        .order('createdat', { ascending: false })
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
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Audit Trail</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            View key record events, exports, and integrity-related actions.
          </p>
        </div>

        <button
          type="button"
          onClick={loadLogs}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-600 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-semibold text-blue-900">Compliance record view</p>
            <p className="mt-1 text-sm leading-6 text-blue-800">
              This screen helps show who did what and when, including export activity and saved receipt events.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200 bg-white">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-slate-500">Loading audit events...</p>
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-800">Could not load audit trail</p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <ShieldCheck className="mx-auto mb-3 h-12 w-12 text-slate-200" />
          <p className="text-sm font-medium text-slate-500">
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
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${meta.iconWrap}`}
                  >
                    {meta.icon}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {log.action || 'Unknown action'}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.pill}`}
                      >
                        {meta.label}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTime(getCreatedAt(log))}
                    </p>

                    {log.details && (
                      <p className="mt-3 text-sm leading-6 text-slate-600">
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