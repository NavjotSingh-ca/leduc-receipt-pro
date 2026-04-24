import Link from 'next/link';
import { ArrowLeft, Scale } from 'lucide-react';
import { AuroraBackground } from '@/components/aceternity/aurora-background';

export default function TermsPage() {
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
              <Scale className="h-8 w-8 text-champagne" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Terms of Service</h1>
              <p className="mt-2 text-sm text-text-secondary">Effective Date: April 24, 2026</p>
            </div>
          </div>

          <div className="prose prose-invert max-w-none text-text-secondary prose-headings:text-white prose-a:text-champagne">
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing and using Telos Labs / Leduc Receipt Pro ("the Service"), you agree to be bound by these Terms of Service. 
              The Service provides data extraction, organization, and compliance tools specifically designed for Canadian business entities and their interactions with the Canada Revenue Agency (CRA).
            </p>

            <h2>2. Data Accuracy and Human Review</h2>
            <p>
              The Service utilizes advanced AI (Google Gemini 2.5) to extract data from uploaded images. 
              <strong>However, the AI is not infallible.</strong> You are solely responsible for reviewing and confirming the accuracy of all extracted data, including subtotals, tax amounts (GST/PST), and vendor information, before confirming and saving records.
            </p>

            <h2>3. CRA Compliance and Liability</h2>
            <p>
              While the Service generates "CRA Audit Packages" and implements IC05-1R1 compliant features such as SHA-256 integrity hashing and immutable logs, <strong>Telos Labs is not a substitute for professional accounting or legal advice.</strong> You retain full responsibility for maintaining compliance with CRA requirements, including the 6-year retention policy for original source documents.
            </p>

            <h2>4. Acceptable Use</h2>
            <p>
              You agree not to upload falsified, fraudulent, or malicious documents. The Service employs automated anomaly detection; suspicious activity may result in account suspension pending review.
            </p>
          </div>
        </div>
      </div>
    </AuroraBackground>
  );
}
