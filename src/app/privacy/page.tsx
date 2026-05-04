import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { AuroraBackground } from '@/components/aceternity/aurora-background';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — 9 Star Labs Receipt Intelligence',
  description:
    'PIPEDA-compliant and Alberta PIPA-aligned privacy policy for 9 Star Labs — the CRA-ready receipt intelligence platform for Canadian businesses.',
  robots: { index: true, follow: true },
};

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-text-primary">{children}</strong>;
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-champagne hover:text-champagne-dim underline underline-offset-2 transition">
      {children}
    </a>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mt-10 mb-4 text-xl font-bold text-white border-b border-white/10 pb-3">
        {title}
      </h2>
      <div className="space-y-4 text-sm leading-7 text-text-secondary">{children}</div>
    </section>
  );
}

const TOC = [
  { id: 'who-we-are', label: '1. Who We Are' },
  { id: 'information-collected', label: '2. Personal Information We Collect' },
  { id: 'purposes', label: '3. Purposes of Collection & Use' },
  { id: 'ai-ml', label: '4. AI & Machine Learning Disclosure' },
  { id: 'storage-security', label: '5. Data Storage & Security' },
  { id: 'retention', label: '6. Data Retention (7-Year CRA Requirement)' },
  { id: 'your-rights', label: '7. Your Rights Under PIPEDA' },
  { id: 'childrens-privacy', label: "8. Children's Privacy" },
  { id: 'cookies', label: '9. Cookies & Session Tokens' },
  { id: 'third-party', label: '10. Third-Party Service Providers' },
  { id: 'cross-border', label: '11. Cross-Border Data Transfers' },
  { id: 'updates', label: '12. Policy Updates & Contact' },
];

export default function PrivacyPage() {
  return (
    <AuroraBackground>
      <div className="relative z-10 mx-auto max-w-4xl px-4 py-20 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-champagne transition hover:text-champagne-dim mb-10 group"
        >
          <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" />
          Return to App
        </Link>

        <div className="rounded-[2.5rem] border border-glass-border bg-black/60 p-8 shadow-2xl backdrop-blur-3xl sm:p-14">

          {/* Header */}
          <div className="mb-10 flex items-start gap-5 border-b border-white/10 pb-10">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-champagne/15 champagne-glow">
              <ShieldCheck className="h-8 w-8 text-champagne" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                Privacy Policy
              </h1>
              <p className="mt-2 text-sm text-text-secondary">
                <B>9 Star Labs Inc.</B> — Edmonton, Alberta, Canada
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-champagne/30 bg-champagne/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-champagne">
                  PIPEDA Compliant
                </span>
                <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-blue-400">
                  Alberta PIPA Aligned
                </span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-emerald-400">
                  Effective: April 27, 2026
                </span>
              </div>
            </div>
          </div>

          {/* Table of Contents */}
          <nav className="mb-10 rounded-2xl border border-glass-border bg-surface/40 p-5">
            <p className="mb-3 text-xs font-black uppercase tracking-widest text-champagne">Contents</p>
            <ol className="space-y-1.5">
              {TOC.map(({ id, label }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="text-sm text-text-secondary hover:text-champagne transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* Opening Statement */}
          <div className="mb-8 rounded-2xl border border-champagne/20 bg-champagne/[0.04] p-5">
            <p className="text-sm leading-7 text-text-secondary">
              <B>9 Star Labs Inc.</B> (&ldquo;9 Star Labs,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the 9 Star Labs
              Receipt Intelligence platform (the &ldquo;Service&rdquo;), a CRA-compliant AI-powered receipt
              capture and expense management system designed for Canadian businesses. We are
              committed to protecting your personal and financial information in accordance with the{' '}
              <B><em>Personal Information Protection and Electronic Documents Act</em></B>{' '}
              (PIPEDA, S.C. 2000, c. 5) and the{' '}
              <B><em>Personal Information Protection Act</em></B>{' '}
              (Alberta PIPA, SA 2003, c. P-6.5). This Privacy Policy explains our practices and
              your rights in plain language. If you have questions, contact us at{' '}
              <A href="mailto:privacy@9starlabs.ca">privacy@9starlabs.ca</A>.
            </p>
          </div>

          {/* Section 1 */}
          <Section id="who-we-are" title="1. Who We Are">
            <p>
              9 Star Labs Inc. is a corporation incorporated under the laws of Alberta, Canada. Our
              principal office is located in Edmonton, Alberta. We provide AI-assisted receipt
              capture, CRA compliance scoring, tamper-evident audit trails, and multi-user expense
              management services to Canadian small and medium-sized businesses, with a focus on the
              Alberta construction, trades, and professional services industries.
            </p>
            <p>
              <B>Our Privacy Officer</B> is responsible for overseeing our compliance with PIPEDA
              and Alberta PIPA. You may contact our Privacy Officer at:{' '}
              <A href="mailto:privacy@9starlabs.ca">privacy@9starlabs.ca</A>
            </p>
          </Section>

          {/* Section 2 */}
          <Section id="information-collected" title="2. Personal Information We Collect">
            <p>We collect personal information in the following categories:</p>
            <div className="rounded-xl border border-glass-border bg-surface/30 p-4 space-y-4">
              {[
                { title: 'a) Account Information', desc: 'Email address and encrypted authentication credentials when you register for an account. We do not store plaintext passwords. Authentication is handled by Supabase Auth, which uses bcrypt hashing.' },
                { title: 'b) Financial Documents', desc: 'Images of physical or digital receipts, invoices, estimates, and bank statements that you upload or capture through the Service. These documents may contain: vendor names, vendor addresses, CRA Business Numbers (BN) and GST/HST registration numbers, transaction amounts, tax amounts (GST/HST/PST), payment card last-four digits, transaction dates and times, line item descriptions, and business purpose notes.' },
                { title: 'c) AI-Extracted Structured Data', desc: 'Data extracted from your financial documents by our AI processing pipeline, including all fields listed in (b) above in structured database form, plus: AI confidence scores, CRA readiness scores, fraud and duplicate detection flags, mathematical consistency warnings, thermal receipt degradation flags, image blur scores, currency and exchange rate information, and SHA-256 cryptographic integrity hashes of the original documents.' },
                { title: 'd) Organizational Information', desc: 'Business unit names, project codes, job site identifiers, and vehicle registration IDs that you or your team associates with expense records for cost allocation.' },
                { title: 'e) Team & Role Information', desc: 'For multi-user organizations: the roles assigned to team members (Owner, Employee, Accountant), invite code history, approval workflow actions (who approved/rejected which expense and when), and reimbursement decisions.' },
                { title: 'f) Technical & Usage Data', desc: 'IP addresses, device type, browser type, operating system, session timestamps, feature interaction events, and error logs collected automatically for security monitoring, fraud prevention, and service improvement. We do not use third-party analytics services.' },
                { title: 'g) Payment Information', desc: 'If you purchase a paid subscription, payment processing is handled exclusively by Stripe. We do not store full credit card numbers. We receive from Stripe only: your Stripe Customer ID, subscription status, and billing period dates.' },
              ].map(({ title, desc }) => (
                <div key={title}>
                  <p className="font-semibold text-text-primary text-sm mb-1">{title}</p>
                  <p>{desc}</p>
                </div>
              ))}
            </div>
            <p>
              <B>We do not collect</B> information about race, ethnicity, religion, health status,
              or other sensitive categories of personal information as defined in PIPEDA. We do not
              collect social insurance numbers (SIN).
            </p>
          </Section>

          {/* Section 3 */}
          <Section id="purposes" title="3. Purposes of Collection & Use">
            <p>Under PIPEDA Principle 2, we collect personal information only for the following identified, specific, and documented purposes:</p>
            <ol className="list-decimal list-outside ml-5 space-y-3">
              <li><B>AI-Powered Receipt Extraction:</B> Transmitting uploaded document images to Google&apos;s Generative AI API (Gemini) to extract structured financial data in support of your bookkeeping and CRA compliance obligations.</li>
              <li><B>CRA Compliance Scoring:</B> Computing real-time CRA readiness scores that assess whether extracted receipt data meets the Canada Revenue Agency&apos;s documentary requirements for Input Tax Credit (ITC) claims under the <em>Excise Tax Act</em>.</li>
              <li><B>Tamper-Evident Audit Trail:</B> Maintaining a SHA-256 Merkle chain audit log of all create, update, approval, and delete events on financial records to support CRA audit defense and internal governance.</li>
              <li><B>Duplicate & Fraud Detection:</B> Computing cryptographic hashes of receipt metadata to identify duplicate submissions; analyzing receipt characteristics via AI to detect potentially fraudulent documents.</li>
              <li><B>Semantic Search:</B> Generating vector embeddings of receipt descriptions (via Google&apos;s text-embedding-004 model) to enable natural-language search across your expense history.</li>
              <li><B>Multi-User Expense Management:</B> Administering role-based access controls, approval workflows, and reimbursement tracking within your organization&apos;s workspace.</li>
              <li><B>Export & Reporting:</B> Generating CRA-compliant CSV, IDEA flat-file, and ZIP archive exports of your expense records for use by accountants, tax preparers, and bookkeepers.</li>
              <li><B>Bank Reconciliation:</B> Matching bank statement transactions against stored receipt records to support month-end accounting processes.</li>
              <li><B>Account Administration:</B> Managing your subscription, processing payments (via Stripe), sending transactional service emails (with your consent under CASL), and providing customer support.</li>
              <li><B>Security & Fraud Prevention:</B> Monitoring for unauthorized access, unusual activity patterns, and potential data integrity violations.</li>
              <li><B>Service Improvement:</B> Using aggregated, de-identified usage metrics to improve the accuracy of our AI models and the usability of the platform. <B>We do not use your specific receipt data or document images to train our AI models or any third-party AI models.</B></li>
            </ol>
            <p><B>We do not sell your personal information.</B> We do not use your financial data for advertising.</p>
          </Section>

          {/* Section 4 */}
          <Section id="ai-ml" title="4. AI & Machine Learning Disclosure">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4 mb-4">
              <p className="font-semibold text-amber-300 text-sm mb-1">Important AI Disclosure</p>
              <p>Images of your financial documents are transmitted to Google LLC&apos;s Generative AI API for extraction processing. This occurs every time you scan a receipt through the Service.</p>
            </div>
            <p><B>What is transmitted to Google:</B> The base64-encoded image of your receipt or financial document, along with a structured prompt instructing the AI to extract specific financial fields. No other personal information (name, email, account ID) is transmitted alongside the image.</p>
            <p><B>Google&apos;s data usage policy:</B> Under Google&apos;s enterprise API terms for Gemini API access, data processed through the API is <B>not used to train Google&apos;s public AI models</B>. Google acts as a data processor on our behalf. For full details, see <A href="https://ai.google.dev/gemini-api/terms">Google&apos;s Generative AI Terms</A> and <A href="https://policies.google.com/privacy">Google&apos;s Privacy Policy</A>.</p>
            <p><B>Vector embeddings for semantic search:</B> Text descriptions derived from your receipts (vendor name, category, notes, amount) are also transmitted to Google&apos;s text-embedding-004 model to generate numerical vector representations stored in our database. These vectors enable natural-language search but do not contain full receipt images or sensitive financial identifiers.</p>
            <p><B>AI accuracy limitations:</B> AI extraction is subject to error. You are responsible for reviewing and verifying all AI-extracted data before submission to the CRA or any accounting system. CRA readiness scores are informational tools, not legal guarantees of deductibility. Always consult a qualified Canadian accountant or tax professional for tax advice.</p>
            <p><B>Opt-out:</B> You may choose to manually enter receipt data without using the AI extraction feature. Contact <A href="mailto:privacy@9starlabs.ca">privacy@9starlabs.ca</A> to request a manual-entry-only account mode.</p>
          </Section>

          {/* Section 5 */}
          <Section id="storage-security" title="5. Data Storage & Security">
            <p>All structured data (receipt records, audit logs, user profiles, organizational settings) is stored in a PostgreSQL database managed by <B>Supabase</B>, which operates on Amazon Web Services (AWS) infrastructure, currently in the <B>us-east-1 (Northern Virginia)</B> region. See Section 11 for cross-border transfer details.</p>
            <p><B>Technical security controls we implement include:</B></p>
            <ul className="list-disc list-outside ml-5 space-y-2">
              <li><B>SHA-256 cryptographic hashing</B> of all document images at the moment of capture, stored as integrity hashes that cannot be altered retroactively.</li>
              <li><B>Merkle chain audit logs</B> — each audit event includes a hash of the previous event, creating a tamper-evident chain of custody for all financial records.</li>
              <li><B>Row Level Security (RLS)</B> at the database layer enforces strict data isolation between organizations.</li>
              <li><B>TLS 1.3 encryption in transit</B> for all data transmitted between your device, our servers, and third-party processors.</li>
              <li><B>AES-256 encryption at rest</B> for all stored data on AWS EBS volumes managed by Supabase.</li>
              <li><B>Role-based access controls</B> — three-tier permission model (Owner, Employee, Accountant) with database-enforced policy boundaries.</li>
              <li><B>Multi-factor authentication (MFA)</B> support via TOTP authenticator apps for all user accounts.</li>
              <li><B>Security headers</B> — X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Strict-Transport-Security with 2-year max-age, and nonce-based Content-Security-Policy enforcement on all pages.</li>
            </ul>
            <p>Despite these safeguards, no internet-based service can guarantee absolute security. If you discover a security vulnerability, please contact us immediately at <A href="mailto:security@9starlabs.ca">security@9starlabs.ca</A>.</p>
          </Section>

          {/* Section 6 */}
          <Section id="retention" title="6. Data Retention — 7-Year CRA Minimum">
            <div className="rounded-xl border border-champagne/20 bg-champagne/[0.04] p-4 mb-2">
              <p className="text-sm font-bold text-champagne mb-1">CRA Legal Requirement</p>
              <p>The <em>Income Tax Act</em> (Canada), s. 230(4), and the <em>Excise Tax Act</em> (Canada), s. 286, require that records supporting tax returns be retained for a minimum of <B>six (6) years from the end of the fiscal year to which they relate</B>. We retain your approved receipt records for a minimum of 7 years from the transaction date to ensure full CRA compliance regardless of your fiscal year-end date.</p>
            </div>
            <ul className="list-disc list-outside ml-5 space-y-2">
              <li><B>Active records</B> are retained indefinitely until you request deletion.</li>
              <li><B>Soft deletion:</B> When you delete a receipt, it is marked as deleted (invisible in the app) but retained in our database for 90 days before permanent purge, to protect against accidental deletion. Receipts within the 7-year CRA window cannot be permanently purged without explicit written acknowledgment of compliance risk.</li>
              <li><B>Edit history:</B> All versions of edited receipts are archived in our immutable receipt history table. This full version history is retained for the same 7-year minimum period.</li>
              <li><B>Audit logs:</B> Tamper-evident audit logs are retained for a minimum of 10 years to support potential CRA enforcement timelines.</li>
              <li><B>Account closure:</B> If you close your account, your data is retained for the applicable CRA retention period. After that period, personal identifiers are purged and financial records are fully deleted. You may request a full data export before account closure.</li>
            </ul>
          </Section>

          {/* Section 7 */}
          <Section id="your-rights" title="7. Your Rights Under PIPEDA">
            <p>Under PIPEDA and Alberta PIPA, you have the following rights with respect to your personal information:</p>
            <div className="space-y-4">
              {[
                { right: 'Right of Access', desc: 'You may request a copy of all personal information we hold about you. We will respond within 30 days of a verified written request. A portable data export (CSV + receipt images ZIP) is available directly from the Export tab in the application.' },
                { right: 'Right of Correction', desc: 'You may request correction of inaccurate personal information. Receipt data can be corrected directly in the application. For account information corrections, contact privacy@9starlabs.ca.' },
                { right: 'Right of Erasure', desc: 'You may request deletion of your account and associated data. Requests within the 7-year CRA retention window will require written acknowledgment that deletion may impair your CRA compliance obligations.' },
                { right: 'Withdrawal of Consent', desc: 'You may withdraw consent to non-essential data processing at any time by contacting privacy@9starlabs.ca. Note that withdrawal of consent to AI extraction will prevent use of the AI scanning features.' },
                { right: 'Right to Complain', desc: 'If you believe your privacy rights have been violated, you may file a complaint with the Office of the Privacy Commissioner of Canada at www.priv.gc.ca or the Office of the Information and Privacy Commissioner of Alberta at www.oipc.ab.ca.' },
              ].map(({ right, desc }) => (
                <div key={right} className="rounded-xl border border-glass-border bg-surface/30 p-4">
                  <p className="text-sm font-bold text-text-primary mb-1">{right}</p>
                  <p>{desc}</p>
                </div>
              ))}
            </div>
            <p>To exercise any of these rights, submit a written request to <A href="mailto:privacy@9starlabs.ca">privacy@9starlabs.ca</A>. We will verify your identity before processing any access, correction, or deletion request.</p>
          </Section>

          {/* Section 8 */}
          <Section id="childrens-privacy" title="8. Children's Privacy">
            <p>The Service is intended exclusively for use by business owners, employees, and accountants managing business expenses. <B>The Service is not directed at, and we do not knowingly collect personal information from, individuals under the age of 18.</B> If you believe a minor has created an account, please contact us immediately at <A href="mailto:privacy@9starlabs.ca">privacy@9starlabs.ca</A> and we will delete that information promptly.</p>
          </Section>

          {/* Section 9 */}
          <Section id="cookies" title="9. Cookies & Session Tokens">
            <p>The Service uses only <B>essential first-party cookies</B> necessary for authentication and security. We do not use advertising cookies, cross-site tracking cookies, or third-party analytics cookies.</p>
            <div className="rounded-xl border border-glass-border bg-surface/30 p-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-glass-border">
                    <th className="text-left py-2 pr-4 font-bold text-text-primary">Cookie</th>
                    <th className="text-left py-2 pr-4 font-bold text-text-primary">Purpose</th>
                    <th className="text-left py-2 font-bold text-text-primary">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-glass-border/50">
                    <td className="py-2 pr-4 font-mono text-champagne">sb-access-token</td>
                    <td className="py-2 pr-4">Supabase authentication JWT. Required for login.</td>
                    <td className="py-2">1 hour (auto-refreshed)</td>
                  </tr>
                  <tr className="border-b border-glass-border/50">
                    <td className="py-2 pr-4 font-mono text-champagne">sb-refresh-token</td>
                    <td className="py-2 pr-4">Allows silent re-authentication without password re-entry.</td>
                    <td className="py-2">60 days</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-champagne">9sl-cookie-consent</td>
                    <td className="py-2 pr-4">Records your cookie consent decision.</td>
                    <td className="py-2">1 year</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {/* Section 10 */}
          <Section id="third-party" title="10. Third-Party Service Providers">
            <p>We share personal information only with the following processors, each bound by a data processing agreement consistent with PIPEDA requirements:</p>
            <div className="space-y-3">
              {[
                { name: 'Google LLC (Gemini API)', purpose: 'AI receipt extraction (OCR) and semantic embedding generation.', policy: 'https://policies.google.com/privacy', region: 'United States (us-central1)' },
                { name: 'Supabase Inc.', purpose: 'Database (PostgreSQL), authentication, file storage, and serverless edge functions.', policy: 'https://supabase.com/privacy', region: 'AWS us-east-1 (Virginia, USA)' },
                { name: 'Vercel Inc.', purpose: 'Application hosting and serverless function execution.', policy: 'https://vercel.com/legal/privacy-policy', region: 'United States' },
                { name: 'Stripe Inc.', purpose: 'Payment processing for Pro/Enterprise subscriptions. Billing information only.', policy: 'https://stripe.com/en-ca/privacy', region: 'United States' },
              ].map(({ name, purpose, policy, region }) => (
                <div key={name} className="rounded-xl border border-glass-border bg-surface/30 p-4">
                  <p className="text-sm font-bold text-text-primary">{name}</p>
                  <p className="mt-1 text-xs text-text-muted">{purpose}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <span className="text-text-muted">Region: <span className="text-text-secondary">{region}</span></span>
                    <A href={policy}>Privacy Policy →</A>
                  </div>
                </div>
              ))}
            </div>
            <p>We do not sell, rent, or trade your personal information to any third party for their own purposes.</p>
          </Section>

          {/* Section 11 */}
          <Section id="cross-border" title="11. Cross-Border Data Transfers">
            <p>Our primary data storage and AI processing infrastructure is located in the <B>United States</B> (AWS us-east-1 and Google Cloud us-central1). By using the Service, you consent to the transfer of your personal information to the United States for processing and storage, as permitted under PIPEDA Schedule 1, Principle 7 (Safeguards) and Alberta PIPA Section 13.</p>
            <p><B>Cross-border transfer safeguards:</B> We require all third-party processors to maintain security standards equivalent to or exceeding those required under Canadian law. Data transferred to the United States may be subject to access by U.S. law enforcement under U.S. laws (including the CLOUD Act).</p>
            <p><B>Our commitment to Canadian data residency:</B> We are actively evaluating Supabase&apos;s Canadian region hosting (AWS ca-central-1) and will migrate as soon as it becomes generally available on our service tier. We will notify all users by email prior to any change in data residency.</p>
          </Section>

          {/* Section 12 */}
          <Section id="updates" title="12. Policy Updates & Contact">
            <p>We will update this Privacy Policy as our practices change, as new features are introduced, or as required by changes in applicable law. We will notify you of material changes by:</p>
            <ul className="list-disc list-outside ml-5 space-y-1">
              <li>Posting the updated policy at this URL with a new effective date</li>
              <li>Sending an email notice to your registered address (for material changes)</li>
              <li>Displaying an in-app banner for 30 days following a significant update</li>
            </ul>

            <div className="mt-6 rounded-2xl border border-champagne/20 bg-champagne/[0.04] p-6">
              <p className="text-sm font-bold text-champagne mb-3">Contact Our Privacy Officer</p>
              <div className="space-y-1 text-sm">
                <p><B>9 Star Labs Inc.</B></p>
                <p>Edmonton, Alberta, Canada</p>
                <p>Email: <A href="mailto:privacy@9starlabs.ca">privacy@9starlabs.ca</A></p>
                <p>Security: <A href="mailto:security@9starlabs.ca">security@9starlabs.ca</A></p>
              </div>
              <p className="mt-4 text-xs text-text-muted">
                This policy was last reviewed and updated on <B>April 27, 2026</B>. Previous versions are available on request.
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-glass-border bg-surface/30 p-4">
              <p className="text-xs text-text-muted">
                <B>External Privacy Authorities:</B>{' '}
                <A href="https://www.priv.gc.ca">Office of the Privacy Commissioner of Canada</A>{' '}
                · <A href="https://www.oipc.ab.ca">Office of the Information and Privacy Commissioner of Alberta</A>
              </p>
            </div>
          </Section>

        </div>
      </div>
    </AuroraBackground>
  );
}
