import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { AuroraBackground } from '@/components/aceternity/aurora-background';

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
              <p className="mt-2 text-sm text-text-secondary">Effective Date: April 24, 2026</p>
            </div>
          </div>

          <div className="prose prose-invert max-w-none text-text-secondary prose-headings:text-white prose-a:text-champagne">
            <h2>1. Information We Collect</h2>
            <p>
              We collect information you provide directly to us when you use Telos Labs. This includes:
            </p>
            <ul>
              <li><strong>Account Information:</strong> Email addresses and secure authentication identifiers.</li>
              <li><strong>Financial Documents:</strong> Images of receipts, invoices, and bank statements uploaded for processing.</li>
              <li><strong>Extracted Data:</strong> Vendor details, tax identifiers, amounts, and metadata derived from your documents.</li>
            </ul>

            <h2>2. How We Use Your Information</h2>
            <p>
              The data collected is used strictly to provide the core service:
            </p>
            <ul>
              <li>Processing and extracting receipt data via integrated AI (Google Gemini).</li>
              <li>Generating compliance reports and maintaining an immutable audit trail.</li>
              <li>Improving our fraud detection algorithms internally.</li>
            </ul>
            <p><strong>We do not sell your financial data to third parties.</strong></p>

            <h2>3. Third-Party Data Processors</h2>
            <p>
              To provide extraction capabilities, uploaded images are securely transmitted to Google's Generative AI API. According to Google's API terms, data processed through their enterprise API is not used to train their public models. Your database records are securely stored via Supabase, utilizing Row Level Security (RLS) to ensure strict tenant isolation.
            </p>

            <h2>4. Data Retention and Security</h2>
            <p>
              We implement industry-standard security measures, including SHA-256 cryptographic hashing of documents, to ensure data integrity. Financial records are retained indefinitely unless explicit deletion is requested, in order to support CRA's 6-year audit requirements.
            </p>
          </div>
        </div>
      </div>
    </AuroraBackground>
  );
}
