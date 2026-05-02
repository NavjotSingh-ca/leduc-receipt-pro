'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ShieldCheck, Loader2, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AuroraBackground } from '@/components/aceternity/aurora-background';

export default function SecuritySettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [factors, setFactors] = useState<any[]>([]);
  const [qrCode, setQrCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [isEnrolling, setIsEnrolling] = useState(false);

  useEffect(() => {
    loadFactors();
  }, []);

  async function loadFactors() {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      setFactors(data.totp || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function startEnrollment() {
    setIsEnrolling(true);
    setError('');
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setQrCode(data.totp.qr_code);
      setFactorId(data.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function verifyEnrollment() {
    if (!verifyCode) {
      setError('Please enter the 6-digit code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: verifyCode,
      });
      if (verify.error) throw verify.error;

      setSuccess('MFA successfully enabled! You will now be prompted for a code when signing in.');
      setIsEnrolling(false);
      setQrCode('');
      setVerifyCode('');
      await loadFactors();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function unenrollFactor(id: string) {
    if (!window.confirm("Are you sure you want to disable MFA? This decreases your account security.")) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
      setSuccess('MFA factor removed.');
      await loadFactors();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuroraBackground>
      <div className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center px-4 py-10 z-10">
        <div className="w-full rounded-3xl border border-glass-border bg-surface/80 p-8 shadow-2xl backdrop-blur-xl sm:p-12">
          
          <div className="mb-8 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15">
              <ShieldCheck className="h-7 w-7 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">Security Settings</h1>
              <p className="text-sm text-text-secondary">Manage Multi-Factor Authentication (MFA)</p>
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

          {loading && !isEnrolling ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-champagne" /></div>
          ) : (
            <div className="space-y-8">
              
              <div className="rounded-2xl border border-glass-border bg-black/20 p-6">
                <h2 className="text-lg font-semibold text-text-primary mb-4">Authenticator App (TOTP)</h2>
                
                {factors.length > 0 ? (
                  <div className="space-y-4">
                    <p className="text-sm text-emerald-400 font-medium flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> MFA is currently enabled.
                    </p>
                    {factors.map(f => (
                      <div key={f.id} className="flex items-center justify-between rounded-xl bg-white/5 p-4 border border-white/10">
                        <div className="flex items-center gap-3">
                          <KeyRound className="h-5 w-5 text-text-muted" />
                          <div>
                            <p className="text-sm font-medium text-text-primary">Device registered</p>
                            <p className="text-xs text-text-muted">ID: {f.id.split('-')[0]}...</p>
                          </div>
                        </div>
                        <button
                          onClick={() => unenrollFactor(f.id)}
                          className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    {!isEnrolling ? (
                      <div>
                        <p className="text-sm text-text-secondary mb-4">Add an additional layer of security to your account by requiring a code from an authenticator app (like Google Authenticator or 1Password).</p>
                        <button
                          onClick={startEnrollment}
                          className="rounded-xl bg-champagne px-4 py-2 text-sm font-bold text-black transition hover:bg-champagne/90"
                        >
                          Enable Authenticator
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <p className="text-sm text-text-secondary">Scan this QR code with your authenticator app.</p>
                        
                        <div className="flex justify-center rounded-xl bg-white p-4 max-w-[200px] mx-auto">
                          <img src={qrCode} alt="QR Code" className="w-full h-auto" />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold uppercase text-text-muted mb-2">Verification Code</label>
                          <input
                            type="text"
                            value={verifyCode}
                            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="w-full rounded-xl border border-glass-border bg-black/40 px-4 py-3 text-center text-lg tracking-[0.5em] text-white outline-none focus:border-champagne/40"
                            placeholder="000000"
                            maxLength={6}
                          />
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={verifyEnrollment}
                            disabled={loading || verifyCode.length !== 6}
                            className="flex-1 flex justify-center items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                          >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Verify and Enable
                          </button>
                          <button
                            onClick={() => { setIsEnrolling(false); setQrCode(''); }}
                            className="rounded-xl border border-glass-border px-4 py-3 text-sm font-medium text-text-secondary hover:bg-white/5"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </AuroraBackground>
  );
}
