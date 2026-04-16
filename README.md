# Leduc Receipt Pro

**Leduc Receipt Pro** is an enterprise-grade, CRA-ready receipt scanning and management web application. Designed specifically for Canadian businesses, it ensures your financial documents are captured with high fidelity, processed for tax compliance, and stored securely with an immutable audit trail.

## 🚀 Features

### 📸 Intelligent Receipt Capture & OCR
- **Edge-device Processing**: In-browser resizing (up to 2000px) and manual cropping to ensure pristine capture before any network upload.
- **AI-Powered OCR**: Uses Google Generative AI to extract vendor details, itemizations, subtotals, and specific Canadian tax portions (GST/HST/PST).
- **CRA Readiness Scoring**: Evaluates the receipt automatically to determine if it meets minimum Canadian Revenue Agency requirements (business number, clear amounts, dates).

### 🛡️ Legal Fortress Suite
- **Deterministic Duplicate Detection**: Generates a fast SHA-256 integrity hash payload on the raw image blob, and combines it with vendor/date/amount fingerprinting to catch duplicates instantly.
- **Confirmation Gating**: Implements strict UX confirmation checkboxes forcing users to verify AI accuracy against physical receipts before creating an official record.
- **Immutable Audit Logs**: Tracks every creation and update natively, ensuring a clear chain of custody.

### 📱 PWA Support
- Installable as a Progressive Web App (PWA) on iOS, Android, and Desktop environments for a native-like experience. Includes completely offline UI assets and rapid load times.

## 🛠️ Tech Stack
- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS, Lucide Icons
- **Database / Auth / Storage**: Supabase
- **AI / LLM**: Google Generative AI 

## 📦 Getting Started

### Prerequisites

You need [Node.js](https://nodejs.org/) installed, along with your preferred package manager (npm, pnpm, or yarn).

### Installation

1. Copy `.env.example` to `.env.local` and populate your API credentials:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY` (if running your own GenAI inference)

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to launch the web client.

## 🧾 License
Proprietary / Internal Business Use Only - Leduc App Suite
