# 9 Star Labs

**9 Star Labs** is an enterprise-grade, multi-tenant receipt scanning and compliance platform. Engineered specifically for Canadian businesses, it provides pristine capture, AI-powered extraction, automated compliance workflows, and immutable audit trails across multiple independent organizations.

## 🚀 Features

### 🏢 Multi-Tenant Organization Engine
- **Tenant Isolation**: Secure data segregation ensures each business's receipts, audits, and employees remain completely isolated.
- **Role-Based Access Control**: Strict Owner, Accountant, and Employee roles govern visibility and actions within each organization.

### 📸 Intelligent Receipt Capture & OCR
- **Edge-device Processing**: In-browser image resizing and a zero-scroll precision cropping modal ensure pristine capture.
- **AI-Powered Extraction**: Uses Google Generative AI to accurately extract vendors, line items, and specific Canadian taxes (GST/HST/PST).
- **CRA Readiness**: Automatically scores the receipt for minimum Canada Revenue Agency requirements (Business Numbers, clear dates).

### 🛡️ Legal Fortress Suite
- **Immutable Audit Logs**: Tracks every creation, update, and soft-deletion with Merkle-chain-like event hashing.
- **Archive-Before-Update**: A rigorous history system preserves the original state of a receipt before any manual edits.
- **Duplicate & Fraud Detection**: Generates fast SHA-256 integrity payloads to catch exact duplicates and flags anomalies (e.g., weekend purchases, non-deductible estimates).

### ⌨️ Professional Workflows
- **Approvals Queue**: Accountants and Owners can review employee submissions using rapid Keyboard Godmode (A = Approve, R = Reject).
- **Reimbursement Tracking**: Complete life-cycle tracking for employee out-of-pocket expenses.
- **Semantic AI Search**: Ask questions like "Coffee with clients in Calgary" to instantly find specific records.

## 🛠️ Tech Stack
- **Framework**: Next.js (React 19)
- **Styling**: Tailwind CSS (Obsidian Elegance Theme)
- **Database / Auth / Security**: Supabase (RLS enforced multi-tenancy)
- **AI / LLM**: Google Generative AI

## 📦 Getting Started

### Installation
1. Copy `.env.example` to `.env.local` and add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`

2. Initialize the Database:
   - Run the provided `migration.sql` script in the Supabase SQL Editor to construct the multi-tenant architecture and RLS policies.

3. Install & Run:
```bash
npm install
npm run dev
```

## 🧾 License
Proprietary / Internal Business Use Only - 9 Star Labs.
