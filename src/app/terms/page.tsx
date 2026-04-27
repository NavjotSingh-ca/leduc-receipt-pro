import Link from 'next/link';
import { ArrowLeft, Scale } from 'lucide-react';
import { AuroraBackground } from '@/components/aceternity/aurora-background';

export const metadata = {
  title: 'Terms of Service — 9 Star Labs',
  description: 'Terms of Service for 9 Star Labs CRA receipt intelligence platform.',
};

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
              <p className="mt-2 text-sm text-text-secondary">9 Star Labs Inc. — Effective Date: April 27, 2026</p>
            </div>
          </div>

          <div className="prose prose-invert max-w-none text-text-secondary prose-headings:text-white prose-a:text-champagne">
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing and using 9 Star Labs ("the Service"), you agree to be bound by these Terms of Service. The Service provides data extraction, organization, and compliance tools specifically designed for Canadian business entities and their interactions with the Canada Revenue Agency (CRA). If you do not agree, do not use the Service.
            </p>

            <h2>2. Data Accuracy and Human Review</h2>
            <p>
              The Service utilizes advanced AI (Google Gemini 2.5 Flash) to extract data from uploaded images. <strong>The AI is not infallible.</strong> You are solely responsible for reviewing and confirming the accuracy of all extracted data — including subtotals, tax amounts (GST/PST), vendor information, and Business Numbers — before saving records. The CRA Readiness Score is an informational tool, not a guarantee of compliance.
            </p>

            <h2>3. CRA Compliance and Liability</h2>
            <p>
              While the Service generates CRA Audit Packages and implements IC05-1R1-aligned controls such as SHA-256 integrity hashing, Merkle chain audit logs, and immutable edit history, <strong>9 Star Labs is not a substitute for professional accounting or legal advice.</strong> You retain full responsibility for maintaining compliance with CRA requirements, including the mandatory 6-year retention policy for original source documents (Income Tax Act, s. 230).
            </p>
            <p>
              <strong>Estimates vs. Receipts:</strong> Documents classified as "Estimates" are not CRA-deductible financial records. Do not treat them as such until a final invoice or receipt is received and confirmed.
            </p>

            <h2>4. Acceptable Use</h2>
            <p>
              You agree not to upload falsified, fraudulent, or malicious documents. The Service employs automated anomaly detection (AI Fraud Sensor); suspicious activity may result in account suspension pending review. You may not use the Service to:
            </p>
            <ul>
              <li>Submit fabricated financial records to government agencies.</li>
              <li>Circumvent tax obligations or misrepresent expense claims.</li>
              <li>Attempt to reverse-engineer, decompile, or tamper with the Service infrastructure.</li>
            </ul>

            <h2>5. Role-Based Access and Multi-User Environments</h2>
            <p>
              The Service provides Owner, Employee, and Accountant roles. Owners are responsible for the actions of all users they invite to their workspace. Access codes are single-use and expire in 24 hours. Owners must not share access codes via insecure channels.
            </p>

            <h2>6. Data Ownership</h2>
            <p>
              You retain full ownership of all data you upload to the Service. 9 Star Labs claims no intellectual property rights over your receipts, invoices, or financial records. You may export and delete your data at any time, subject to the CRA 6-year retention requirements noted in our Privacy Policy.
            </p>

            <h2>7. Service Availability</h2>
            <p>
              9 Star Labs is provided "as is." We strive for high availability but do not guarantee uninterrupted service. We are not liable for data loss arising from network failures, provided you have maintained your own backup exports per the CRA retention requirements.
            </p>

            <h2>8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by applicable law, 9 Star Labs shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service, including but not limited to tax penalties resulting from inaccurate AI extraction that was not reviewed and corrected by the user.
            </p>

            <h2>9. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the Province of Alberta and the federal laws of Canada applicable therein, without regard to conflict of law principles.
            </p>

            <h2>10. Contact</h2>
            <p>
              For legal inquiries, contact us at: <a href="mailto:legal@9starlabs.ca">legal@9starlabs.ca</a>
            </p>
          </div>
        </div>
      </div>
    </AuroraBackground>
  );
}
