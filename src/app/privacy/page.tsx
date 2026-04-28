import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { AuroraBackground } from '@/components/aceternity/aurora-background';

export const metadata = {
  title: 'Privacy Policy — 9 Star Labs',
  description: 'PIPEDA-compliant privacy policy for 9 Star Labs CRA receipt intelligence platform.',
};

export default function PrivacyPage() {
  return (
    <AuroraBackground>
      <div className="relative z-10 mx-auto max-w-4xl px-4 py-20 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-champagne transition hover:text-champagne-dim mb-8">
          <ArrowLeft className="h-4 w-4" />
          Return to App
        </Link>
        
        <div className="rounded-[2.5rem] border border-glass-border bg-black/60 p-8 shadow-2xl backdrop-blur-3xl sm:p-12">
          <div className="mb-10 flex items-center gap-4 border-b border-white/10 pb-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-champagne/15 champagne-glow">
              <ShieldCheck className="h-8 w-8 text-champagne" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Privacy Policy</h1>
              <p className="mt-2 text-sm text-text-secondary">9 Star Labs — Effective Date: April 27, 2026</p>
              <p className="mt-1 text-xs text-champagne font-semibold uppercase tracking-widest">PIPEDA Compliant</p>
            </div>
          </div>

          <div className="prose prose-invert max-w-none text-text-secondary prose-headings:text-white prose-a:text-champagne">
            <p className="text-sm leading-relaxed text-text-secondary">
              9 Star Labs ("9 Star Labs", "we", "us", or "our") is committed to protecting your personal information in accordance with the <em>Personal Information Protection and Electronic Documents Act</em> (PIPEDA) and applicable provincial privacy legislation. This policy explains how we collect, use, disclose, and retain your information.
            </p>

            <h2>1. Information We Collect</h2>
            <p>We collect information you provide directly to us when you use 9 Star Labs. This includes:</p>
            <ul>
              <li><strong>Account Information:</strong> Email addresses and secure authentication identifiers.</li>
              <li><strong>Financial Documents:</strong> Images of receipts, invoices, and bank statements uploaded for processing.</li>
              <li><strong>Extracted Data:</strong> Vendor details, tax identifiers (GST/HST Business Numbers), amounts, and metadata derived from your documents.</li>
              <li><strong>Usage Data:</strong> Log data, IP addresses, device type, and interaction events collected automatically for security and service improvement.</li>
            </ul>

            <h2>2. Purposes of Collection</h2>
            <p>Under PIPEDA, we collect only information necessary for the following identified purposes:</p>
            <ul>
              <li>Processing and extracting receipt data via integrated AI (Google Gemini).</li>
              <li>Generating CRA-compliant reports and maintaining an immutable, tamper-evident audit trail.</li>
              <li>Calculating tax recoverable amounts (GST/HST Input Tax Credits) for Canadian business entities.</li>
              <li>Detecting duplicate or fraudulent receipts to protect your financial records.</li>
              <li>Providing role-based access controls for multi-user business environments.</li>
            </ul>
            <p><strong>We do not sell your financial data to third parties. We do not use your receipt data for advertising.</strong></p>

            <h2>3. Third-Party Data Processors</h2>
            <p>
              To provide extraction capabilities, uploaded images are securely transmitted to Google's Generative AI API. Under Google's enterprise API terms, data processed through their API is not used to train their public models. Your database records are stored via Supabase (PostgreSQL), utilizing Row Level Security (RLS) to ensure strict data isolation between users and business units.
            </p>
            <p>
              We maintain data processing agreements with all third-party processors in accordance with PIPEDA requirements.
            </p>

            <h2>4. Data Retention — 6-Year CRA Policy</h2>
            <p>
              The Canada Revenue Agency (CRA) requires business records to be retained for a minimum of <strong>six (6) years</strong> from the end of the tax year to which they relate (as per the <em>Income Tax Act</em>, s. 230). To support this requirement:
            </p>
            <ul>
              <li>Receipt records are retained indefinitely by default. You may not delete records within the 6-year CRA retention window without acknowledging compliance risk.</li>
              <li>All edits are captured in an immutable archive log before any modification is applied.</li>
              <li>SHA-256 integrity hashes are stored at the moment of capture and cannot be altered.</li>
            </ul>

            <h2>5. Your Rights Under PIPEDA</h2>
            <p>You have the right to:</p>
            <ul>
              <li><strong>Access:</strong> Request a copy of all personal information we hold about you.</li>
              <li><strong>Correction:</strong> Request correction of inaccurate personal information.</li>
              <li><strong>Erasure:</strong> Request deletion of your account and associated data, except where retention is required by law (e.g., the 6-year CRA window). Requests must be submitted in writing to <a href="mailto:privacy@9starlabs.ca">privacy@9starlabs.ca</a>.</li>
              <li><strong>Withdrawal of Consent:</strong> You may withdraw consent to non-essential data processing. Note that withdrawal may affect service functionality.</li>
            </ul>

            <h2>6. Security Safeguards</h2>
            <p>
              We implement appropriate technical and organizational safeguards including: SHA-256 cryptographic hashing of all documents, Merkle chain audit logs for tamper-evident history, Row Level Security at the database layer, HTTPS encryption in transit, and access controls enforced by role-based permissions.
            </p>

            <h2>7. Data Residency</h2>
            <p>
              Data is currently stored on Supabase infrastructure, which may be hosted in the United States. We are committed to implementing Canadian-region hosting as soon as Supabase makes it generally available. By using the service, you consent to this cross-border transfer under PIPEDA Schedule 1, Principle 7.
            </p>

            <h2>8. Contact</h2>
            <p>
              For privacy inquiries or to exercise your rights, contact our Privacy Officer at:<br />
              <a href="mailto:privacy@9starlabs.ca">privacy@9starlabs.ca</a>
            </p>
          </div>
        </div>
      </div>
    </AuroraBackground>
  );
}
