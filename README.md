# 9 Star Labs - Receipt Pro (OMEGA-X)

**Receipt Pro** is an enterprise-grade financial management platform designed for CRA-compliant receipt tracking, automated AI extraction, and seamless accounting integration.

## 🚀 Quick Start

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Setup**:
   Create a `.env.local` file based on `.env.example`:
   ```bash
   cp .env.example .env.local
   ```
   Fill in your Supabase credentials, Google Gemini API key, and integration secrets.

3. **Database Setup**:
   - Run `migration.sql`, `migration_v2.sql`, and `migration_v4.sql` in your Supabase SQL Editor.
   - Enable **Realtime** for the `receipts` table.
   - Configure **Storage** buckets: `receipt-images`.

4. **Edge Functions**:
   Deploy the background embedding generator:
   ```bash
   supabase functions deploy generate-embedding
   ```

5. **Run Development Server**:
   ```bash
   npm run dev
   ```

## 🛠 Features

- **AI Extraction**: Uses Google Gemini 2.5 Flash for high-accuracy receipt parsing and fraud detection.
- **Background Embeddings**: Vector embeddings are generated via Supabase Edge Functions for fast, semantic search.
- **MFA Security**: TOTP-based Multi-Factor Authentication for account hardening.
- **Enterprise Pagination**: High-performance server-side pagination with TanStack Infinite Query.
- **Accounting Sync**: Foundational support for QuickBooks Online and Xero.
- **CRA Compliance**: Built-in audit logs, data integrity hashing, and 7-year retention logic.

## 📂 Architecture

- **Frontend**: Next.js 15 (App Router), Tailwind CSS v4, Framer Motion.
- **Backend**: Supabase (Auth, Postgres, Storage, Edge Functions).
- **Data Fetching**: TanStack Query v5.
- **State Management**: React Server Actions & React Hooks.

## 🔐 Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key |
| `GOOGLE_AI_KEY` | Google Gemini API Key (Client-side) |
| `GEMINI_API_KEY` | Google Gemini API Key (Edge Functions) |
| `NEXT_PUBLIC_SITE_URL` | Application URL (Redirects) |
| `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` | Intuit Developer Credentials |
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | Xero Developer Credentials |

---

*Note: This project was evolved from the OMEGA-X Infrastructure Remediation Plan.*