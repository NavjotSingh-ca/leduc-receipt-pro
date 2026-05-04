import Link from 'next/link';
import { ArrowLeft, FileSignature } from 'lucide-react';
import { AuroraBackground } from '@/components/aceternity/aurora-background';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — 9 Star Labs Receipt Intelligence',
  description: 'Terms of Service and License Agreement for 9 Star Labs.',
  robots: { index: true, follow: true },
};

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-text-primary">{children}</strong>;
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

export default function TermsPage() {
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
          <div className="mb-10 flex items-start gap-5 border-b border-white/10 pb-10">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-champagne/15 champagne-glow">
              <FileSignature className="h-8 w-8 text-champagne" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                Terms of Service
              </h1>
              <p className="mt-2 text-sm text-text-secondary">
                <B>9 Star Labs Inc.</B> — Edmonton, Alberta, Canada
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-champagne/30 bg-champagne/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-champagne">
                  Legal Agreement
                </span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-emerald-400">
                  Effective: April 27, 2026
                </span>
              </div>
            </div>
          </div>

          <div className="mb-8 rounded-2xl border border-champagne/20 bg-champagne/[0.04] p-5">
            <p className="text-sm leading-7 text-text-secondary">
              By accessing or using the 9 Star Labs Receipt Intelligence platform (the &ldquo;Service&rdquo;),
              you agree to be bound by these Terms of Service. Please read them carefully. If you do not
              agree to these terms, you may not use the Service.
            </p>
          </div>

          <Section id="acceptance" title="1. Acceptance of Terms">
            <p>
              These Terms of Service constitute a legally binding agreement between you (whether personally
              or on behalf of an entity) and 9 Star Labs Inc. (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), concerning your access
              to and use of the 9 Star Labs web application.
            </p>
          </Section>

          <Section id="license" title="2. License & Access">
            <p>
              We grant you a limited, non-exclusive, non-transferable, revocable license to use the Service
              for your internal business purposes. You shall not reverse-engineer, decompile, or attempt to
              extract the source code of the Service or its underlying AI models.
            </p>
          </Section>

          <Section id="cra-compliance" title="3. CRA Compliance & Tax Liability">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4 mb-4">
              <p className="font-semibold text-amber-300 text-sm mb-1">No Tax Advice or Guarantee</p>
              <p>
                The Service provides &ldquo;CRA Readiness Scores&rdquo; and tax rate validations based on AI extraction.
                These are informational tools only. <B>9 Star Labs does not provide tax, legal, or accounting advice.</B>
                You are solely responsible for ensuring that your receipts and records comply with the
                <em> Income Tax Act</em> and <em>Excise Tax Act</em> requirements. We do not guarantee
                that records accepted by our system will be accepted by the Canada Revenue Agency during an audit.
              </p>
            </div>
          </Section>

          <Section id="ai-accuracy" title="4. AI Extraction Accuracy">
            <p>
              The Service utilizes generative AI models to extract text from your uploads. While we implement
              secondary validation passes, AI is inherently subject to inaccuracies (&ldquo;hallucinations&rdquo;).
              You agree that you must review and verify all extracted data before saving it. We are not liable
              for any financial losses, tax penalties, or reporting errors arising from inaccurate AI extractions.
            </p>
          </Section>

          <Section id="data-retention" title="5. Data Retention">
            <p>
              To support compliance, we retain approved records for a minimum of 7 years. You agree not to
              attempt to circumvent our retention locks. If you delete an account, we maintain the records
              as required by law before final destruction.
            </p>
          </Section>

          <Section id="limitation" title="6. Limitation of Liability">
            <p>
              To the maximum extent permitted by applicable law, 9 Star Labs shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages, including loss of profits,
              data, or business interruption, arising out of your use of the Service. Our total liability
              shall not exceed the amount you paid us in the twelve (12) months preceding the claim.
            </p>
          </Section>
          
          <Section id="governing" title="7. Governing Law">
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the Province of
              Alberta and the federal laws of Canada applicable therein, without regard to conflict of law principles.
            </p>
          </Section>

        </div>
      </div>
    </AuroraBackground>
  );
}
