'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Settings, Loader2, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AuroraBackground } from '@/components/aceternity/aurora-background';
import { useRouter } from 'next/navigation';

export default function OrgSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [settings, setSettings] = useState({
    business_name: '',
    business_number: '',
    address: '',
    province: 'AB',
    gst_registrant: true,
    high_value_threshold: 500.0,
    require_approval_above: 500.0,
    slack_webhook_url: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data: orgData } = await supabase.rpc('get_user_org');
      const orgId = orgData as unknown as string;
      if (!orgId) {
        setError('No organization found.');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('organization_settings')
        .select('*')
        .eq('org_id', orgId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 is not found
      
      if (data) {
        setSettings({
          business_name: data.business_name || '',
          business_number: data.business_number || '',
          address: data.address || '',
          province: data.province || 'AB',
          gst_registrant: data.gst_registrant ?? true,
          high_value_threshold: data.high_value_threshold ?? 500.0,
          require_approval_above: data.require_approval_above ?? 500.0,
          slack_webhook_url: data.slack_webhook_url || '',
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { data: orgData } = await supabase.rpc('get_user_org');
      const orgId = orgData as unknown as string;

      const { error } = await supabase
        .from('organization_settings')
        .upsert({
          org_id: orgId,
          ...settings,
          updated_at: new Date().toISOString()
        }, { onConflict: 'org_id' });

      if (error) throw error;
      setSuccess('Organization settings saved successfully.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuroraBackground>
      <div className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-24 z-10">
        
        <div className="mb-6">
          <button onClick={() => router.push('/')} className="text-sm font-semibold text-text-secondary hover:text-champagne transition">&larr; Back to Dashboard</button>
        </div>

        <div className="w-full rounded-3xl border border-glass-border bg-surface/80 p-8 shadow-2xl backdrop-blur-xl sm:p-12">
          
          <div className="mb-8 flex items-center gap-4 border-b border-glass-border pb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-champagne/15">
              <Settings className="h-7 w-7 text-champagne" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">Organization Settings</h1>
              <p className="text-sm text-text-secondary">Manage global policies and configuration</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400 border border-red-500/20">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-6 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="h-4 w-4" />
              <span>{success}</span>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-champagne" /></div>
          ) : (
            <div className="space-y-8">
              
              {/* Business Info */}
              <div>
                <h3 className="text-lg font-bold text-text-primary mb-4">Business Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-text-muted mb-1.5">Business Name</label>
                    <input
                      type="text"
                      value={settings.business_name}
                      onChange={(e) => setSettings({ ...settings, business_name: e.target.value })}
                      className="w-full rounded-xl border border-glass-border bg-black/40 px-4 py-2.5 text-sm text-white outline-none focus:border-champagne/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-text-muted mb-1.5">CRA Business Number (GST/BN)</label>
                    <input
                      type="text"
                      value={settings.business_number}
                      onChange={(e) => setSettings({ ...settings, business_number: e.target.value })}
                      className="w-full rounded-xl border border-glass-border bg-black/40 px-4 py-2.5 text-sm text-white outline-none focus:border-champagne/40"
                    />
                  </div>
                </div>
              </div>

              {/* Thresholds & Policies */}
              <div className="pt-6 border-t border-glass-border">
                <h3 className="text-lg font-bold text-text-primary mb-4">Reimbursement & Approval Policies</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-text-muted mb-1.5">Require Approval Above ($)</label>
                    <input
                      type="number"
                      value={settings.require_approval_above}
                      onChange={(e) => setSettings({ ...settings, require_approval_above: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded-xl border border-glass-border bg-black/40 px-4 py-2.5 text-sm text-white outline-none focus:border-champagne/40"
                    />
                    <p className="mt-1.5 text-xs text-text-muted">Receipts below this amount are auto-approved.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-text-muted mb-1.5">High Value Flag Threshold ($)</label>
                    <input
                      type="number"
                      value={settings.high_value_threshold}
                      onChange={(e) => setSettings({ ...settings, high_value_threshold: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded-xl border border-glass-border bg-black/40 px-4 py-2.5 text-sm text-white outline-none focus:border-champagne/40"
                    />
                  </div>
                </div>
              </div>

              {/* Integrations */}
              <div className="pt-6 border-t border-glass-border">
                <h3 className="text-lg font-bold text-text-primary mb-4">Accounting Integrations</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="flex items-center justify-between rounded-2xl border border-glass-border bg-black/20 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 overflow-hidden rounded-lg bg-white p-1">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/2/23/QuickBooks_Logo.svg" alt="QBO" className="h-full w-full object-contain" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">QuickBooks Online</p>
                        <p className="text-[10px] text-text-secondary uppercase tracking-wider">Not Connected</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => window.location.href = '/api/integrations/qbo?action=connect'}
                      className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-champagne hover:bg-white/10"
                    >
                      Connect
                    </button>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-glass-border bg-black/20 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 overflow-hidden rounded-lg bg-[#00b7e2] p-1">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/9/9f/Xero_software_logo.svg" alt="Xero" className="h-full w-full object-contain" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">Xero</p>
                        <p className="text-[10px] text-text-secondary uppercase tracking-wider">Not Connected</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => window.location.href = '/api/integrations/xero?action=connect'}
                      className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-champagne hover:bg-white/10"
                    >
                      Connect
                    </button>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-text-primary mb-4">Webhooks</h3>
                <div>
                  <label className="block text-xs font-semibold uppercase text-text-muted mb-1.5">Slack/Teams Webhook URL (Audit Alerts)</label>
                  <input
                    type="url"
                    value={settings.slack_webhook_url}
                    onChange={(e) => setSettings({ ...settings, slack_webhook_url: e.target.value })}
                    className="w-full rounded-xl border border-glass-border bg-black/40 px-4 py-2.5 text-sm text-white outline-none focus:border-champagne/40"
                    placeholder="https://hooks.slack.com/services/..."
                  />
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-6 border-t border-glass-border flex justify-end">
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-champagne px-6 py-3 text-sm font-bold text-black transition hover:bg-champagne/90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Configuration
                </button>
              </div>

            </div>
          )}
        </div>
      </div>
    </AuroraBackground>
  );
}
