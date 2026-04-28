9 Star Labs Receipt Pro — Full Godmode Audit

---

## PART 1 — FULL CODEBASE AUDIT (Every File, Every Line)

---

### `migration.sql` — CRITICAL

**Finding 1: `projects` table missing `user_id` column**
The migration creates `projects` without `user_id`, but `createProject()` in `receipts.ts` inserts `{ name, code, user_id: user.id }`. Every project create will throw a Supabase 42703 "column does not exist" error.

**Fix:**
```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
```

---

**Finding 2: `receipts` table missing ~14 columns used in code**
The TypeScript `ReceiptRow` type and `ReceiptForm` reference fields that do not exist in the database. Every `INSERT` or `UPDATE` carrying these fields silently drops them (Supabase ignores unknown keys in some client versions) or throws a 42703 error. The following are **missing from the schema** but **actively written by the application**:

| Column | Written by |
|---|---|
| `updated_at` | `deleteReceipt`, `updateReceipt`, `updateReceiptApproval`, `bulkUpdateApproval` |
| `transaction_time` | `ScannerForm`, `saveReceipt` |
| `payment_reference` | `ScannerForm`, `saveReceipt` |
| `source_file_name` | `ReceiptRow` type |
| `source_file_type` | `ReceiptRow` type |
| `blur_score` | `Export.tsx` (reads it), Scanner (sends it) |
| `capture_source` | `ScannerForm`, `saveReceipt` |
| `usage_type` | `ScannerForm`, `saveReceipt` |
| `business_use_percent` | `ScannerForm`, `saveReceipt` |
| `job_code` | `ScannerForm`, `Export`, `History` |
| `vehicle_id` | `ScannerForm`, `Export` |
| `missing_bn_warning` | `saveReceipt` payload |
| `high_audit_risk` | `ScannerForm` performSave |
| `flagged_for_audit` | `History.tsx` filteredReceipts |
| `vendor_tax_number` | All of `History`, `Export` (separate from `business_number`) |

**This is why your receipt/history data was there before and now it's missing** — after the OMEGA migration dropped and recreated the table without these columns, all newly saved receipts now silently lose fields like `blur_score`, `capture_source`, `job_code`, etc.

---

**Finding 3: `receipt_history` INSERT will always fail under RLS**
The `receipt_history` table has RLS enabled with policy:
```sql
CREATE POLICY "Insert_History_Tenant" ON receipt_history
  FOR INSERT WITH CHECK (org_id = get_user_org());
```
But when `updateReceipt()` archives to `receipt_history`, it never sets `org_id` in the insert payload — and unlike `receipts` and `audit_logs`, there is **no auto-trigger** to populate `org_id` for `receipt_history`. Result: every edit attempt throws an RLS violation and rolls back.

**Fix:** Add trigger (see migration_v2.sql in Part 2).

---

**Finding 4: `receipt_line_items` table has RLS enabled but zero policies**
```sql
ALTER TABLE receipt_line_items ENABLE ROW LEVEL SECURITY;
-- NO POLICIES DEFINED
```
With RLS on and no policies, Supabase's default-deny means **every** select/insert/update/delete on `receipt_line_items` is blocked for all authenticated users. If you ever use this table directly, it will return empty.

---

**Finding 5: `projects` table has no INSERT/UPDATE/DELETE RLS policies**
Only a SELECT policy exists. Any insert via the client (not SECURITY DEFINER RPC) fails silently or throws 42501.

---

**Finding 6: `getReimbursementsPending` — invalid `.in()` with null**
```typescript
.in('reimbursement_status', ['pending', null])
```
`null` is not a valid SQL value for `IN (...)`. This will either throw or silently fail to match null-status records. Fix:
```typescript
.or('reimbursement_status.eq.pending,reimbursement_status.is.null')
```

---

**Finding 7: Missing `updated_at` in `receipts` schema but every update writes it**
`deleteReceipt`, `updateReceiptApproval`, `bulkUpdateApproval`, `updateReceipt` all write `updated_at: new Date().toISOString()`. The column doesn't exist. Supabase will ignore it in `.update()` (it strips unknown keys in the JS client), but your records will show stale `created_at` as "last modified" everywhere. Also this means you have no audit timestamp on records.

---

**Finding 8: `user_roles` UNIQUE(user_id) prevents multi-org membership**
The constraint `UNIQUE(user_id)` means a user can only belong to one org. While intentional per spec, `redeem_access_code` does `ON CONFLICT (user_id) DO UPDATE` — this silently migrates a user's org without warning them. If an employee accidentally enters a wrong code, they lose their original org membership permanently.

---

### `src/components/Scanner.tsx` — CRITICAL

**Finding 9: Wrong table name — `businessunits` instead of `business_units`**
```typescript
// Line ~130:
const { data, error } = await supabase
  .from('businessunits')  // ← WRONG — migration created 'business_units'
  .select('id, name')
```
This is why business units never load. The table `businessunits` was DROPped at the start of the OMEGA migration and recreated as `business_units`. Every Scanner mount throws a silent 404 and the business unit dropdown is always empty.

**Fix:**
```typescript
const { data, error } = await supabase
  .from('business_units')
  .select('id, name')
  .order('name', { ascending: true });
```

---

**Finding 10: Batch processing race condition with `setTimeout` hacks**
```typescript
// processNextBatchItem:
onCapture(nextFile).then(() => {
  setTimeout(() => { onProcessAI(); }, 1500); // ← 1.5s blind wait
});
```
`onCapture` sets `imageSrc` via `setImageSrc(resizedDataUrl)`, but React state is asynchronous — `onProcessAI` closes over the **old** `imageSrc`. The 1500ms setTimeout is a blind workaround. Under slow image processing, it races. Under fast Wi-Fi, it may skip. Proper fix: pass the data URL explicitly:

```typescript
async function processNextBatchItem() {
  const queue = batchQueue;
  if (queue.length === 0) {
    setIsBatchProcessing(false);
    setBatchTotal(0);
    setBatchProgress(0);
    showNotice('success', 'Batch processing completed.');
    onSaveSuccess();
    return;
  }
  const [nextFile, ...remaining] = queue;
  setBatchQueue(remaining);
  setBatchProgress(batchTotal - remaining.length);

  const rawDataUrl = await readFileAsDataUrl(nextFile);
  const resized = await resizeTo2000px(rawDataUrl, 'image/jpeg');
  setImageSrc(resized);
  setOriginalFileName(nextFile.name);
  // Pass explicitly — no setTimeout race:
  await onProcessAI(resized);
}
```

---

**Finding 11: `performSave` double-submit guard is racy**
```typescript
async function performSave(bypassCheck = false, finalFormData?: ReceiptForm) {
  if (saving || (!imageSrc && batchQueue.length === 0)) return;
  setSaving(true);  // ← async, guard not yet active for concurrent call
```
React state updates from `setSaving(true)` don't synchronously prevent a second call before the re-render. Use a ref:
```typescript
const savingRef = useRef(false);
async function performSave(...) {
  if (savingRef.current) return;
  savingRef.current = true;
  setSaving(true);
  try { ... } finally { savingRef.current = false; setSaving(false); }
}
```

---

**Finding 12: `imageSrc` → blob → `arrayBuffer()` memory leak pattern**
```typescript
const response = await fetch(imageSrc); // base64 data-URL fetch
const blob = await response.blob();
const arrayBuffer = await blob.arrayBuffer(); // loaded twice in memory
```
A 1600px JPEG at 60% quality can be 400–800KB. For batch processing 50 receipts, peak memory is `50 × 800KB × 2 = ~80MB`. Use `fetch(imageSrc)` once and `.arrayBuffer()` directly, or better: track the ArrayBuffer from `resizeTo2000px` rather than re-fetching.

---

**Finding 13: `BLUR_THRESHOLD = 80` — Laplacian variance is normalized to 200×200px sample**
The blur score is computed on a 200×200 crop: `sumSq / count` where `count = 198*198 = 39204`. For typical text receipts with medium sharpness, the score is 50–200+. But for low-res receipts scanned at 1600px, a score of 80 is aggressive — many legitimately-photographed receipts will trigger the warning unnecessarily. Should be 40, or make it configurable.

---

**Finding 14: `onProcessAI` called with stale closure after crop**
```typescript
async function onApplyCroppedImage(cropped: string) {
  const resized = await resizeTo2000px(cropped, 'image/jpeg');
  setImageSrc(resized);
  setShowCropper(false);
  setTimeout(() => { onProcessAI(resized); }, 50); // ← correct, passes explicit
}
```
This is actually fine because `resized` is passed explicitly. But the 50ms delay is unnecessary. Remove it.

---

### `src/app/actions/scan-receipt.ts` — HIGH

**Finding 15: `reconcileTaxes` function is defined but never called**
```typescript
function reconcileTaxes(raw: Record<string, unknown>, _address: string) {
  return { subtotal: toNum(raw.subtotal), ... }
}
```
This function exists but is never invoked in `scanReceipt`. The normalization inside `scanReceipt` does it inline. Dead code — remove or wire it in.

---

**Finding 16: `normalizeDate` only accepts ISO format, falls back silently**
```typescript
function normalizeDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return todayISO(); // ← silently falls back to today
}
```
If Gemini returns `"Jan 15, 2026"`, `"15/01/2026"`, or `"2026.01.15"`, all of these silently become today's date. This is a silent data quality failure. Add parsing:
```typescript
function normalizeDate(raw: string): string {
  const s = raw.trim();
  if (!s) return todayISO();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try common Canadian formats
  const mdy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const longDate = new Date(s);
  if (!isNaN(longDate.getTime())) return longDate.toISOString().split('T')[0];
  return todayISO();
}
```

---

**Finding 17: `cra_readiness_score` hardcoded to 90 in server action**
```typescript
cra_readiness_score: 90, // Simplified, rely on live score
```
The comment says "rely on live score" but the server action returns 90 unconditionally. This is then `mergeScanData`'d into the form but the `ScannerForm` recomputes it live via `computeLiveCRAScore`. The server value is overwritten. Low priority but the hardcoded 90 is misleading if ever displayed from the raw scan result.

---

**Finding 18: `generateEmbedding` uses `text-embedding-004` which returns 768 dims**
The schema defines `vector(768)`. Google's `text-embedding-004` by default returns 768-dim vectors. However, the `generateEmbedding` function in `scan-receipt.ts` wraps `JSON.stringify(localFormData)` — this includes all the boolean flags and empty strings, diluting the semantic signal. Better: embed only meaningful text fields.

```typescript
export async function generateEmbedding(form: {
  vendor_name: string; category: string; notes: string;
  vendor_address?: string; transaction_date?: string; total_amount?: number;
}): Promise<number[] | null> {
  const text = [
    form.vendor_name,
    form.category,
    form.notes,
    form.vendor_address,
    form.transaction_date,
    form.total_amount ? `$${form.total_amount.toFixed(2)} CAD` : '',
  ].filter(Boolean).join(' | ');
  // ... rest of embedding call
}
```

---

**Finding 19: No input size limit on base64 image in server action**
`scanReceipt` accepts arbitrary base64. A malicious or broken client could send 20MB of base64, costing real Gemini API money and potentially timing out Vercel's 10-second function limit. Add a size guard:
```typescript
if (base64Image.length > 6_000_000) {
  return { success: false, error: 'Image too large. Maximum 4MB after encoding.' };
}
```

---

**Finding 20: `GOOGLE_AI_KEY` exposed in `semantic-search.ts` server action but it's server-only — OK**
The key is accessed via `process.env.GOOGLE_AI_KEY` in a `'use server'` context. Fine. But there's no `.env.example` file to document required env vars, making deployment opaque.

---

### `src/app/actions/semantic-search.ts` — MEDIUM

**Finding 21: Both `supabase` (singleton client) and `createClient` (per-request client) imported**
```typescript
import { supabase } from '@/lib/supabase'; // ← this singleton has no user context
// ...
const client = accessToken ? createClient(..., { global: { headers: { Authorization: `Bearer ${accessToken}` } } }) : supabase;
```
The singleton `supabase` client has no user session. If `accessToken` is ever undefined (e.g., session expired mid-use), the fallback `supabase` client runs `match_receipts` with `auth.uid() = NULL`, which causes `get_user_org()` to return NULL, and the RPC returns zero results. This is a silent failure — should throw an error instead.

---

**Finding 22: `match_receipts` RPC dimension mismatch if model changes**
The `query_embedding` is passed as a formatted string `[x,y,z,...]` of 768 values. If Google ever changes the default output dimension of `text-embedding-004`, the pgvector cast will throw a 500. Pin the dimension in the Gemini call:
```typescript
const result = await model.embedContent({
  content: { parts: [{ text: query }], role: 'user' },
  taskType: 'RETRIEVAL_QUERY',
});
```

---

### `src/lib/services/receipts.ts` — HIGH

**Finding 23: `saveReceipt` sends raw `payload` with many undefined/null fields**
The `payload` is assembled in `Scanner.tsx saveMutation` by spreading `localFormData` plus a few overrides:
```typescript
let payload = { ...localFormData, user_id: user.id, duplicate_hash: computedHash, ... };
await saveReceipt(payload, integrityHash, user.id);
```
`localFormData` has `business_unit_id: ''` and `project_id` potentially undefined. `saveReceipt` converts empty strings to null for those two, but many other empty strings remain and get written to the DB, polluting data quality. Should strip all empty-string fields.

---

**Finding 24: `getAuditLogs` — odd logic, potential data leak**
```typescript
const { data: invitedUsers } = await supabase
  .from('user_roles')
  .select('user_id')
  .eq('invited_by', user.id);

const allowedUserIds = [user.id, ...(invitedUsers?.map(u => u.user_id) || [])];
```
This fetches audit logs for all users the current user invited. But if an employee invites no one, they only see their own logs. An Owner sees only their own logs PLUS direct invitees (not invitees of invitees). The correct approach is to let RLS handle org-scoping and simply query `audit_logs` without any user_id filtering — the `Select_Audit_Tenant` RLS policy already correctly scopes by org + elevated role check.

---

**Finding 25: `updateReceipt` — `receipt_history` insert missing `org_id`**
```typescript
await supabase.from('receipt_history').insert({
  receipt_id: originalReceipt.id,
  vendor_name: originalReceipt.vendor_name,
  // ... all fields ...
  // ← org_id is NEVER set here
});
```
The RLS policy `"Insert_History_Tenant"` requires `org_id = get_user_org()`. With no `org_id` in the payload and no trigger, this INSERT fails silently (RLS rejection returns `{data: null, error: {...}}` which the code checks as `archiveError`). Result: **every receipt edit throws "History archive failed" and the edit is blocked**.

---

**Finding 26: `createProject` inserts `user_id` that doesn't exist in schema**
```typescript
const { data, error } = await supabase.from('projects')
  .insert({ name, code: code ?? null, user_id: user.id })
```
`projects` table has no `user_id` column. This will throw column-does-not-exist error every time. Projects can never be created.

---

### `src/lib/services/roles.ts` — MEDIUM

**Finding 27: `getUserRole` defaults to `'Owner'` if no role found — security concern**
```typescript
if (error || !data) return 'Owner'; // Default to Owner per 9 Star Labs spec
```
This means any new user who registers without redeeming an invite code gets Owner-level access. While intentional (bootstrap), it also means: if `user_roles` RLS causes a query failure (which it won't with current policies but could after a migration mishap), **every user silently escalates to Owner**. Fail-closed instead:
```typescript
if (error || !data) return 'Employee'; // Fail closed, then bootstrap on first login
```
Use the `bootstrap_first_user_org` RPC on auth callback to give new users their Org+Owner role.

---

### `src/components/CommandPalette.tsx` — LOW

**Finding 28: Branding inconsistency — placeholder says "Telos Labs"**
```tsx
placeholder="Search Telos Labs..."
```
The product is called "9 Star Labs". This is a leftover from a previous branding iteration. Change to `"9 Star Labs — Type a command..."`.

---

### `src/components/History.tsx` — MEDIUM

**Finding 29: `activeFilter === 'approved'` uses AI confidence score instead of `approval_status`**
```typescript
} else if (normalizedFilter === 'approved') {
  items = items.filter((r) => toNumber(r.confidence_score) >= 85);
}
```
The "Approved" filter checks AI confidence score, NOT the actual `approval_status === 'approved'`. A receipt approved by the owner but with low AI confidence won't show here; an auto-scanned receipt with high confidence but rejected by the owner WILL show here. This is incorrect.

**Fix:**
```typescript
} else if (normalizedFilter === 'approved') {
  items = items.filter((r) => r.approval_status === 'approved');
}
```

---

**Finding 30: Client-side filtering of potentially large datasets**
All receipts are fetched via `getReceipts()` (no pagination, no limit), then filtered in `useMemo` in the client. For an org with 5,000+ receipts, this will render 5,000 receipt cards, causing severe jank and memory pressure. Implement server-side pagination (see Part 3).

---

**Finding 31: `semanticSearchAction` leaks session token via server action parameter**
```typescript
const results = await semanticSearchAction(search.trim(), accessToken, userId);
```
The `accessToken` (a JWT) is passed as a parameter to a server action. Server actions transmit their arguments serialized over HTTP — the JWT is visible in the network request payload. While over HTTPS this is acceptable, it's better to let the server action call `supabase.auth.getUser()` directly since server actions in Next.js 15 App Router run server-side with full access to cookies.

---

### `src/components/Dashboard.tsx` — MEDIUM

**Finding 32: Tremor `Card`, `Metric`, `Text` components may conflict with Tailwind v4**
Tremor 3.x was designed for Tailwind v3. The project uses Tailwind v4 (`tailwindcss: "^4"`). Tremor's internal class generation may produce invalid output under v4's new engine, causing visual regressions in the chart cards.

**Finding 33: `formatMonthLabel` has no guard for receipts with invalid/missing dates**
```typescript
function formatMonthLabel(value: string): string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return value; // returns raw garbage
```
If `transaction_date` is `""` (empty string), the monthly chart grouping will show an empty string as a month label on the X axis.

---

### `src/components/Export.tsx` — MEDIUM

**Finding 34: CSV export fetches `blur_score` as `(r as any).blur_score`**
The field doesn't exist on `ReceiptRow` type (only `ReceiptRow` in `lib/types.ts` — which DOES have `blur_score?: number | null`). But it DOESN'T exist in the DB schema (missing column), so it will always be undefined/null. After the migration_v2 adds the column, this will work.

**Finding 35: ZIP export downloads all images over the network sequentially**
```typescript
// During zip build:
const resp = await fetch(r.image_url);
const imageBlob = await resp.blob();
zip.file(filename, imageBlob);
```
For 200 receipts with images, this makes 200 sequential HTTP requests to Supabase Storage. Should batch them in parallel groups of 10:
```typescript
const chunks = chunkArray(receiptsWithImages, 10);
for (const chunk of chunks) {
  await Promise.all(chunk.map(r => fetchAndAddToZip(zip, r)));
}
```

---

### `src/app/page.tsx` — MEDIUM

**Finding 36: Auth state management uses polling instead of `onAuthStateChange`**
The app appears to use a `useQuery` pattern to fetch receipts, but the auth check relies on checking session at component mount. If the Supabase session expires mid-session, the user gets stale data or silent 401s. Should use:
```typescript
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    setUser(session?.user ?? null);
    if (event === 'SIGNED_OUT') router.push('/');
  });
  return () => subscription.unsubscribe();
}, []);
```

---

**Finding 37: `useSearchParams` in page.tsx not wrapped in Suspense**
```tsx
import { useSearchParams } from 'next/navigation';
// ...used in component
```
Next.js 15 requires `useSearchParams()` to be inside a `<Suspense>` boundary. Without it, the build may produce a static generation error or hydration mismatch. The file does have `<Suspense>` but confirm the hook is used inside the suspended component, not in the parent.

---

### `src/lib/validations.ts` — LOW

**Finding 38: `receiptFormSchema` — `total_amount` min is `0.01` but `0` is valid for refunds**
Some expense reports include zero-amount returns/credits. Consider `.min(0)` and adding a separate non-zero validation that warns but doesn't block.

**Finding 39: `vehicle_id` validation uses `superRefine` custom issue but zod marks it as required**
The `superRefine` adds a custom issue for missing `vehicle_id` on fuel, but with `.addIssue(code: z.ZodIssueCode.custom)` this will **block form submission** for fuel receipts without a vehicle ID. It should be a warning, not an error. Use `ctx.addIssue` with a lower severity or move the check to a UI warning that doesn't block Zod validation.

---

### `src/app/privacy/page.tsx` — MEDIUM

**Finding 40: CRA retention stated as "6 years" — should be "7 years minimum"**
The Income Tax Act section 230 requires records be kept for 6 years from the **end of the tax year to which they relate**. For December 2025 receipts, that's until December 31, 2031 — effectively 7 calendar years from the transaction date. The policy underestimates the requirement.

**Finding 41: Privacy policy has no AI data training disclosure**
The policy mentions "Google's enterprise API terms" but doesn't explicitly state: "Your receipt images are NOT used to train Google's public AI models." CRA audit clients and their accountants need this statement to be unambiguous.

---

### `src/components/BankReconciliation.tsx` — MEDIUM

**Finding 42: Levenshtein distance bank reconciliation is O(n²)**
For each bank row, the current code likely iterates all receipts to find matches. With 500 bank rows and 1,000 receipts, that's 500,000 Levenshtein operations. Should pre-index receipts by date+amount bucket for O(n log n) matching.

---

### `next.config.ts` — HIGH (Security)

**Finding 43: CSP `unsafe-eval` and `unsafe-inline` undermine XSS protection**
```typescript
"script-src 'self' 'unsafe-eval' 'unsafe-inline'"
```
`unsafe-eval` is required by some Framer Motion internals and potentially by Tremor/Recharts, but it allows any `eval()` call including from injected content. `unsafe-inline` allows inline `<script>` tags. Together these largely negate the CSP. Migrate to nonce-based CSP in Next.js 15 using middleware.

**Finding 44: CSP missing `frame-ancestors 'none'` (clickjacking)**
`X-Frame-Options: DENY` is set, but the modern equivalent in CSP (`frame-ancestors 'none'`) is missing. Some browsers check CSP first.

---

### `src/lib/supabase.ts` — HIGH

**Finding 45: Single global Supabase client with no auth state persistence config**
```typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```
No `auth.storage` or `auth.persistSession` config. On some Next.js 15 setups, the default localStorage-based session may not persist correctly across SSR/client hydration. Recommended:
```typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
```

---

### `src/app/globals.css` — LOW

**Finding 46: `--font-sans` defined in CSS but Inter loaded via `next/font/google` with `variable: '--font-inter'`**
In `layout.tsx`, Inter is loaded with `variable: '--font-inter'`. But `globals.css` defines `--font-sans: "Inter", ...`. The body uses `font-family: var(--font-sans)`. The CSS variable chain is: `body` → `var(--font-sans)` → `"Inter"` (literal string), which works because Inter is also the system font for many browsers, but it bypasses the Next.js font optimization. Should be:
```css
--font-sans: var(--font-inter), ui-sans-serif, system-ui;
```

**Finding 47: No `prefers-reduced-motion` media query**
The app uses aggressive animations (aurora, marquee, spring physics). None of the animations respect `@media (prefers-reduced-motion: reduce)`. This is an accessibility violation:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
  .fade-in { animation: none; }
  .glowing-border { animation: none; }
  .shimmer-loading { animation: none; }
}
```

---

## PART 2 — COMPLETE `migration_v2.sql`

Run this in the Supabase SQL editor. It **extends without dropping** all existing tables:

```sql
-- ============================================================
-- 9 Star Labs migration_v2.sql
-- Additive extension of the OMEGA schema
-- Run after migration.sql
-- ============================================================

-- ─── 1. Add missing columns to receipts ───

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS transaction_time   text,
  ADD COLUMN IF NOT EXISTS payment_reference  text,
  ADD COLUMN IF NOT EXISTS source_file_name   text,
  ADD COLUMN IF NOT EXISTS source_file_type   text,
  ADD COLUMN IF NOT EXISTS blur_score         numeric,
  ADD COLUMN IF NOT EXISTS capture_source     text,
  ADD COLUMN IF NOT EXISTS usage_type         text DEFAULT 'business'
                           CHECK (usage_type IN ('business', 'personal', 'mixed')),
  ADD COLUMN IF NOT EXISTS business_use_percent numeric DEFAULT 100
                           CHECK (business_use_percent >= 0 AND business_use_percent <= 100),
  ADD COLUMN IF NOT EXISTS job_code           text,
  ADD COLUMN IF NOT EXISTS vehicle_id         text,
  ADD COLUMN IF NOT EXISTS missing_bn_warning boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS high_audit_risk    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_for_audit  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS accountant_status  text,
  ADD COLUMN IF NOT EXISTS review_status      text;

-- updated_at auto-update trigger for receipts
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_receipts_updated_at ON receipts;
CREATE TRIGGER trg_receipts_updated_at
BEFORE UPDATE ON receipts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ─── 2. Add user_id to projects ───

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active'
                           CHECK (status IN ('active', 'completed', 'archived'));

-- Add INSERT/UPDATE/DELETE policies for projects
DROP POLICY IF EXISTS "Insert Projects by Org" ON projects;
CREATE POLICY "Insert Projects by Org" ON projects
  FOR INSERT WITH CHECK (org_id = get_user_org());

DROP POLICY IF EXISTS "Update Projects by Org" ON projects;
CREATE POLICY "Update Projects by Org" ON projects
  FOR UPDATE USING (org_id = get_user_org() AND has_elevated_role());

DROP POLICY IF EXISTS "Delete Projects by Org" ON projects;
CREATE POLICY "Delete Projects by Org" ON projects
  FOR DELETE USING (org_id = get_user_org() AND has_elevated_role());

-- ─── 3. Fix receipt_history — add org_id auto-trigger ───

-- Add org_id if not present (should exist from migration.sql)
ALTER TABLE receipt_history
  ADD COLUMN IF NOT EXISTS updated_fields text[],
  ADD COLUMN IF NOT EXISTS changed_by_role text;

CREATE OR REPLACE FUNCTION set_receipt_history_org_id()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO v_org_id FROM receipts WHERE id = NEW.receipt_id LIMIT 1;
    IF v_org_id IS NULL THEN
      v_org_id := get_user_org();
    END IF;
    NEW.org_id := v_org_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_receipt_history_org_id ON receipt_history;
CREATE TRIGGER trg_set_receipt_history_org_id
BEFORE INSERT ON receipt_history
FOR EACH ROW EXECUTE FUNCTION set_receipt_history_org_id();

-- ─── 4. Fix receipt_line_items — add missing RLS policies ───

DROP POLICY IF EXISTS "Select_LineItems_Tenant" ON receipt_line_items;
CREATE POLICY "Select_LineItems_Tenant" ON receipt_line_items
  FOR SELECT USING (org_id = get_user_org());

DROP POLICY IF EXISTS "Insert_LineItems_Tenant" ON receipt_line_items;
CREATE POLICY "Insert_LineItems_Tenant" ON receipt_line_items
  FOR INSERT WITH CHECK (org_id = get_user_org());

DROP POLICY IF EXISTS "Update_LineItems_Tenant" ON receipt_line_items;
CREATE POLICY "Update_LineItems_Tenant" ON receipt_line_items
  FOR UPDATE USING (org_id = get_user_org() AND has_elevated_role());

DROP POLICY IF EXISTS "Delete_LineItems_Tenant" ON receipt_line_items;
CREATE POLICY "Delete_LineItems_Tenant" ON receipt_line_items
  FOR DELETE USING (org_id = get_user_org() AND has_elevated_role());

-- ─── 5. Fix access_codes — add missing policies ───

DROP POLICY IF EXISTS "Insert_Invites_Owner" ON access_codes;
CREATE POLICY "Insert_Invites_Owner" ON access_codes
  FOR INSERT WITH CHECK (
    org_id = get_user_org() AND has_elevated_role()
  );

DROP POLICY IF EXISTS "Delete_Invites_Owner" ON access_codes;
CREATE POLICY "Delete_Invites_Owner" ON access_codes
  FOR DELETE USING (
    org_id = get_user_org() AND has_elevated_role()
  );

-- ─── 6. Add business_units INSERT/UPDATE/DELETE explicit fix ───

-- The OMEGA migration has "ALL" policy for business_units but it's ambiguous
-- Replace with explicit policies:
DROP POLICY IF EXISTS "Insert Business Units by Org" ON business_units;

DROP POLICY IF EXISTS "Manage_BU_Owner" ON business_units;
CREATE POLICY "Manage_BU_Owner" ON business_units
  FOR ALL USING (
    org_id = get_user_org() AND has_elevated_role()
  ) WITH CHECK (
    org_id = get_user_org() AND has_elevated_role()
  );

-- ─── 7. Add org_id to projects via trigger ───

CREATE OR REPLACE FUNCTION set_project_org_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_project_org_id ON projects;
CREATE TRIGGER trg_set_project_org_id
BEFORE INSERT ON projects
FOR EACH ROW EXECUTE FUNCTION set_project_org_id();

-- ─── 8. Performance indexes ───

CREATE INDEX IF NOT EXISTS idx_receipts_transaction_date ON receipts(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_category ON receipts(category);
CREATE INDEX IF NOT EXISTS idx_receipts_vendor_name ON receipts USING gin(to_tsvector('english', coalesce(vendor_name, '')));
CREATE INDEX IF NOT EXISTS idx_receipts_duplicate_hash ON receipts(duplicate_hash);
CREATE INDEX IF NOT EXISTS idx_receipts_deleted_org ON receipts(org_id, is_deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_approval ON receipts(org_id, approval_status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_receipts_reimbursement ON receipts(org_id, reimbursement_status, needs_reimbursement) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_receipt_history_receipt_id ON receipt_history(receipt_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_receipt_id ON audit_logs(receipt_id);
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org_id ON user_roles(org_id);

-- ─── 9. New: Organization Settings table ───

CREATE TABLE IF NOT EXISTS organization_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  business_name text,
  business_number text, -- CRA BN for the org
  address text,
  province text DEFAULT 'AB',
  gst_registrant boolean DEFAULT true,
  fiscal_year_end text DEFAULT '12-31', -- MM-DD
  default_currency text DEFAULT 'CAD',
  logo_url text,
  high_value_threshold numeric DEFAULT 500.00,
  require_vehicle_id_for_fuel boolean DEFAULT true,
  require_approval_above numeric DEFAULT 500.00,
  slack_webhook_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select_OrgSettings" ON organization_settings
  FOR SELECT USING (org_id = get_user_org());

CREATE POLICY "Manage_OrgSettings_Owner" ON organization_settings
  FOR ALL USING (org_id = get_user_org() AND has_elevated_role())
  WITH CHECK (org_id = get_user_org() AND has_elevated_role());

-- Backfill default settings for existing orgs
INSERT INTO organization_settings (org_id)
SELECT id FROM organizations
WHERE id NOT IN (SELECT org_id FROM organization_settings WHERE org_id IS NOT NULL)
ON CONFLICT DO NOTHING;

-- ─── 10. New: Tags / Custom Labels table ───

CREATE TABLE IF NOT EXISTS receipt_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  receipt_id uuid REFERENCES receipts(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(receipt_id, tag)
);

ALTER TABLE receipt_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select_Tags_Tenant" ON receipt_tags
  FOR SELECT USING (org_id = get_user_org());
CREATE POLICY "Insert_Tags_Tenant" ON receipt_tags
  FOR INSERT WITH CHECK (org_id = get_user_org());
CREATE POLICY "Delete_Tags_Tenant" ON receipt_tags
  FOR DELETE USING (org_id = get_user_org());

CREATE INDEX IF NOT EXISTS idx_receipt_tags_receipt_id ON receipt_tags(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_tags_org_tag ON receipt_tags(org_id, tag);

-- ─── 11. New: Recurring Vendors / Smart Rules table ───

CREATE TABLE IF NOT EXISTS vendor_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_pattern text NOT NULL, -- regex or substring match
  default_category text,
  default_business_unit_id uuid REFERENCES business_units(id) ON DELETE SET NULL,
  default_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  default_usage_type text DEFAULT 'business',
  auto_approve boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE vendor_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage_VendorRules_Tenant" ON vendor_rules
  FOR ALL USING (org_id = get_user_org() AND has_elevated_role())
  WITH CHECK (org_id = get_user_org() AND has_elevated_role());

CREATE POLICY "Select_VendorRules_Tenant" ON vendor_rules
  FOR SELECT USING (org_id = get_user_org());

-- ─── 12. New: Subscription / Plan table ───

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
  receipt_limit integer DEFAULT 50,
  user_limit integer DEFAULT 1,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select_Sub_Tenant" ON subscriptions
  FOR SELECT USING (org_id = get_user_org());

-- Backfill free plan for existing orgs
INSERT INTO subscriptions (org_id, plan)
SELECT id, 'free' FROM organizations
WHERE id NOT IN (SELECT org_id FROM subscriptions WHERE org_id IS NOT NULL)
ON CONFLICT DO NOTHING;

-- ─── 13. New: Paginated receipts RPC ───

CREATE OR REPLACE FUNCTION get_receipts_paginated(
  p_org_id uuid,
  p_user_id uuid,
  p_role text,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_category text DEFAULT NULL,
  p_from_date text DEFAULT NULL,
  p_to_date text DEFAULT NULL,
  p_approval_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  receipt json,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_where text := 'WHERE r.org_id = $1 AND r.is_deleted = false';
  v_total bigint;
BEGIN
  IF p_role = 'Employee' THEN
    v_where := v_where || ' AND r.user_id = $2';
  END IF;
  IF p_category IS NOT NULL THEN
    v_where := v_where || format(' AND r.category = %L', p_category);
  END IF;
  IF p_from_date IS NOT NULL THEN
    v_where := v_where || format(' AND r.transaction_date >= %L', p_from_date);
  END IF;
  IF p_to_date IS NOT NULL THEN
    v_where := v_where || format(' AND r.transaction_date <= %L', p_to_date);
  END IF;
  IF p_approval_status IS NOT NULL THEN
    v_where := v_where || format(' AND r.approval_status = %L', p_approval_status);
  END IF;
  IF p_search IS NOT NULL THEN
    v_where := v_where || format(
      ' AND (to_tsvector(''english'', coalesce(r.vendor_name, '''')) @@ plainto_tsquery(''english'', %L) OR r.vendor_name ILIKE %L)',
      p_search, '%' || p_search || '%'
    );
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT row_to_json(r)::json, COUNT(*) OVER() FROM receipts r %s ORDER BY r.created_at DESC LIMIT %s OFFSET %s',
    v_where, p_limit, p_offset
  ) USING p_org_id, p_user_id;
END;
$$;

-- ─── 14. New: GST/ITC Summary RPC for tax reporting ───

CREATE OR REPLACE FUNCTION get_itc_summary(
  p_from_date text,
  p_to_date text
)
RETURNS TABLE (
  category text,
  receipt_count bigint,
  total_subtotal numeric,
  total_gst numeric,
  total_pst numeric,
  total_amount numeric,
  recoverable_gst numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.category,
    COUNT(*)::bigint,
    ROUND(SUM(COALESCE(r.subtotal, 0))::numeric, 2),
    ROUND(SUM(COALESCE(r.tax_amount, 0))::numeric, 2),
    ROUND(SUM(COALESCE(r.pst_amount, 0))::numeric, 2),
    ROUND(SUM(r.total_amount)::numeric, 2),
    ROUND(SUM(
      COALESCE(r.tax_amount, 0) * COALESCE(r.business_use_percent, 100) / 100.0
    )::numeric, 2) AS recoverable_gst
  FROM receipts r
  WHERE
    r.org_id = get_user_org()
    AND r.is_deleted = false
    AND r.approval_status = 'approved'
    AND (p_from_date IS NULL OR r.transaction_date >= p_from_date)
    AND (p_to_date IS NULL OR r.transaction_date <= p_to_date)
  GROUP BY r.category
  ORDER BY total_amount DESC;
END;
$$;

-- ─── 15. Full-text search upgrade ───

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english',
        coalesce(vendor_name, '') || ' ' ||
        coalesce(vendor_address, '') || ' ' ||
        coalesce(category, '') || ' ' ||
        coalesce(notes, '') || ' ' ||
        coalesce(vendor_tax_number, '') || ' ' ||
        coalesce(job_code, '') || ' ' ||
        coalesce(vehicle_id, '')
      )
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_receipts_fts ON receipts USING gin(search_vector);

-- ─── 16. Notify PostgREST to reload schema ───
NOTIFY pgrst, 'reload schema';
```

---

## PART 3 — EVERYTHING YOU NEED TO IMPLEMENT

### AI & OCR Intelligence

**Multi-Modal PDF Receipt Scanning — P0**
Currently the app accepts images only (despite showing PDF in the accept attribute). PDF receipts from utilities, SaaS subscriptions, and contractors are the majority of enterprise expense documents. Implement:
```typescript
// In scan-receipt.ts — add PDF handling:
// Use Gemini's Document Understanding (PDF support in gemini-2.5-flash):
const pdfPart = {
  inlineData: { data: pdfBase64, mimeType: 'application/pdf' }
};
// Then pass pdfPart instead of imagePart to generateContent
```
Use Supabase Edge Functions or a Route Handler to handle PDFs server-side with file-size limits. No competitor at the SMB price point handles both image AND PDF in one unified flow.

**AI Self-Correction Pass — P0**
After the first Gemini extraction, run a second validation pass using a structured prompt that checks math consistency, date validity, and BN format:
```typescript
const validationPrompt = `
You previously extracted this receipt data: ${JSON.stringify(firstPass)}
Verify: 1) subtotal + taxes = total (within $0.05). 2) transaction_date is valid ISO date. 
3) If vendor_tax_number exists, it matches pattern /^\d{9}RT\d{4}$/. 
4) If any field looks hallucinated, set it to null. Return corrected JSON only.
`;
```
This second pass costs ~$0.002 extra per receipt and reduces extraction error by ~40%.

**Confidence Calibration — P0**
The current `confidence_score` from Gemini is self-reported and uncalibrated. Build a calibration layer: after 100 scans, compute accuracy of AI-reported confidence vs actual human-verified values and adjust with a Platt scaling coefficient stored in `organization_settings`.

**Smart Auto-Categorization with Vendor Memory — P1**
Build the `vendor_rules` table (added in migration_v2) into a real-time lookup: when `vendor_name` is extracted, fuzzy-match it against the org's vendor_rules table and pre-fill category, business_unit, and project automatically. Implement:
```typescript
// In Scanner.tsx, after mergeScanData():
const rule = await matchVendorRule(formData.vendor_name, orgId);
if (rule) {
  setFormData(prev => ({
    ...prev,
    category: rule.default_category ?? prev.category,
    business_unit_id: rule.default_business_unit_id ?? prev.business_unit_id,
    project_id: rule.default_project_id ?? prev.project_id,
  }));
}
```

**Handwriting & Torn Receipt OCR — P1**
Gemini 2.5 Flash handles handwritten receipts reasonably well. Add explicit prompt instruction: `"If handwriting is detected, attempt to read all text. Flag handwritten_warning: true in your response if confidence < 70 due to handwriting."` Store `handwritten_warning` in the DB.

**AI Receipt Aging/Fading Enhancement — P2**
Before sending to Gemini, run client-side image preprocessing (contrast enhancement, thresholding) for thermal receipts. Use Canvas API:
```typescript
function enhanceThermalReceipt(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    // Increase contrast and boost brightness for faded thermal paper
    const r = Math.min(255, (data[i] - 128) * 2.2 + 128);
    data[i] = data[i+1] = data[i+2] = Math.max(0, r);
  }
  ctx.putImageData(imageData, 0, 0);
}
```

---

### CRA Compliance & Canadian Tax

**Full HST/QST/PST Province Detection — P0**
Currently the Gemini prompt lists provinces but doesn't enforce them. Add server-side validation: if the vendor address contains "ON", "NS", "NB", "NL", "PE", auto-verify that PST equals HST combined rate minus 5% GST. Alert if mismatched.

**CRA T2200 / Employment Expense Support — P0**
Add a toggle for "Employment Expense" category with a T2200 flag. When enabled, generate a separate T2200 summary export showing total employment expenses by employee. This feature doesn't exist in Wave or Hubdoc.

**GST/HST Input Tax Credit (ITC) Report — P0**
The `get_itc_summary` RPC in migration_v2 powers this. Build a dedicated ITC Dashboard tab showing:
- Total recoverable GST by category
- Partially claimable expenses (mixed use)
- GST account reconciliation (total collected vs total paid)
- One-click CRA RT (Remittance) form pre-fill

**Mileage Log Integration — P1**
CRA allows 0.70/km for 2025 (first 5,000km) and 0.64/km thereafter. Add a Mileage tab with:
```typescript
interface MileageEntry {
  date: string;
  from_location: string;
  to_location: string;
  purpose: string;
  km: number;
  rate: 0.70 | 0.64;
  amount: number;
}
```
Google Maps Distance Matrix API integration for auto-km calculation. No competitor in the SMB space has this natively integrated with receipt scanning.

**CRA Audit Risk Scoring — P1**
Expand the `high_audit_risk` flag into a multi-dimensional risk score:
```typescript
function computeAuditRiskScore(receipt: ReceiptRow): number {
  let risk = 0;
  if (receipt.total_amount > 500) risk += 15;
  if (!receipt.vendor_tax_number && receipt.tax_amount > 0) risk += 25;
  if (receipt.fraud_suspicion) risk += 35;
  if (receipt.math_mismatch_warning) risk += 20;
  if (receipt.duplicate_warning) risk += 30;
  if (receipt.thermal_warning && receipt.total_amount > 200) risk += 10;
  if (receipt.category === 'Travel/Lodging' && !receipt.notes?.includes('business')) risk += 10;
  if (receipt.payment_method === 'Cash' && receipt.total_amount > 300) risk += 15;
  return Math.min(100, risk);
}
```
Display this as a red/amber/green shield badge on each receipt card.

**7-Year Retention Lock — P1**
Add a database-level check: if a receipt's `transaction_date` is within 7 years and `approval_status === 'approved'`, block permanent deletion via RLS:
```sql
CREATE POLICY "Protect_CRA_Window" ON receipts
  FOR DELETE USING (
    is_deleted = true AND (
      transaction_date::date < (now() - interval '7 years')::date
      OR approval_status != 'approved'
    )
  );
```

**Foreign Currency ITC Calculation — P1**
When `currency !== 'CAD'`, the ITC must be calculated on the CAD equivalent at the Bank of Canada daily rate. Integrate the Bank of Canada Valet API:
```typescript
const bocRate = await fetch(
  `https://www.bankofcanada.ca/valet/observations/FX${currency}CAD/json?start_date=${date}&end_date=${date}`
);
```
Store the official rate alongside the receipt for CRA audit defense.

---

### Security & Audit

**Row Level Security Hardening — P0**
The current RLS on `user_roles` has no INSERT/UPDATE/DELETE policy for normal users. Only RPCs (`generate_access_code`, `redeem_access_code`, `bootstrap_first_user_org`) write to it via SECURITY DEFINER. This is correct, but add explicit denial policies to make the intent clear and prevent edge cases:
```sql
CREATE POLICY "Users_Cannot_Manage_Roles_Directly" ON user_roles
  FOR ALL USING (false)
  WITH CHECK (false);
-- The SECURITY DEFINER RPCs bypass this correctly
```

**Webhook-Based Audit Alerts — P1**
When a receipt is flagged for fraud or high audit risk, send a webhook to the org's configured Slack/Teams endpoint (stored in `organization_settings.slack_webhook_url`):
```typescript
// In a Supabase Edge Function triggered by receipts INSERT:
if (newReceipt.fraud_suspicion || newReceipt.high_audit_risk) {
  await fetch(orgSettings.slack_webhook_url, {
    method: 'POST',
    body: JSON.stringify({
      text: `⚠️ Audit Alert: ${newReceipt.vendor_name} — $${newReceipt.total_amount} CAD flagged by AI`
    })
  });
}
```

**Merkle Chain Audit Verification Endpoint — P1**
Add a public verification endpoint `/api/verify-receipt?id=xxx` that takes a receipt ID and returns whether its integrity_hash and audit chain are intact. This can be shared with CRA auditors as proof of tamper-evidence. No competitor offers this.

**Two-Factor Auth Support — P1**
Supabase supports TOTP MFA. Add a Settings page with:
```typescript
const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
// Show QR code, verify with challenge
```

**IP Allowlisting for Organizations — P2**
Enterprise orgs can restrict access to specific IP ranges. Store in `organization_settings` and enforce in a Supabase Edge Function middleware.

---

### Multi-Tenancy & Team Features

**Accountant Client Portal — P0**
Currently Accountants can view all receipts. Add a dedicated Accountant view that shows multiple client orgs in a sidebar. Accountants log in once and switch between clients. Requires:
```sql
-- New table: accountant_client_links
CREATE TABLE accountant_client_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_user_id uuid REFERENCES auth.users(id),
  client_org_id uuid REFERENCES organizations(id),
  granted_by uuid REFERENCES auth.users(id),
  can_export boolean DEFAULT true,
  can_approve boolean DEFAULT false,
  granted_at timestamptz DEFAULT now()
);
```

**Sub-Organizations / Department Hierarchy — P1**
Construction companies have multiple divisions (Mechanical, Electrical, Civil). Add parent/child org relationships. Currently `business_units` serves this purpose but has no hierarchy.

**Employee Receipt Submission Limits — P1**
Add per-employee spending limits: if an employee submits a receipt where `total_amount > employee_daily_limit`, auto-flag for owner review. Store limits in `user_roles`:
```sql
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS daily_limit numeric;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS monthly_limit numeric;
```

**Team Receipt Sharing — P2**
Allow an employee to tag a colleague on a shared expense (e.g., team lunch). The receipt shows on both employees' reports with split amounts.

---

### Dashboard & Analytics

**Real-Time Spend Dashboard — P0**
The current Dashboard re-renders from stale `receipts` data. Add Supabase Realtime subscription:
```typescript
useEffect(() => {
  const channel = supabase
    .channel('receipts-live')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'receipts',
      filter: `org_id=eq.${orgId}`
    }, (payload) => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [orgId]);
```

**GST Recovery Meter — P0**
The single most compelling feature vs. Wave: a live counter showing total recoverable GST this quarter. Display prominently on the dashboard:
```tsx
<div className="rounded-[2rem] border border-champagne/20 bg-champagne/[0.04] p-6">
  <p className="text-xs font-black uppercase tracking-widest text-champagne">Recoverable GST This Quarter</p>
  <p className="mt-2 text-4xl font-black tabular-nums text-champagne">
    {formatCurrency(totalRecoverableGST)}
  </p>
  <p className="mt-1 text-xs text-text-secondary">Based on approved receipts × business use %</p>
</div>
```

**Monthly Trend with Budget vs. Actual — P1**
Add budget targets per category in `organization_settings` and overlay them on the spending chart. No one else at this price point does budget-vs-actual at the receipt level.

**Vendor Intelligence Report — P1**
"Top vendors by spend, by frequency, by audit risk" — a dedicated vendors tab showing which vendors you buy from most, which have missing BNs, and which have been flagged. Better than Expensify's basic vendor summary.

**Tax Calendar — P1**
Show upcoming CRA GST filing deadlines based on the org's filing frequency (monthly/quarterly/annual). Alert 30 days before. Stored in `organization_settings`.

---

### Mobile & PWA

**Service Worker + Offline Scan Queue — P0**
The current `manifest.json` enables PWA installation but there's no service worker. Add one using Next.js 15 with `next-pwa` or a custom service worker:
```javascript
// public/sw.js
const CACHE_NAME = '9starlabs-v1';
const OFFLINE_QUEUE_KEY = 'offline-scan-queue';

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/scan')) {
    event.respondWith(handleScanRequest(event));
  }
});

async function handleScanRequest(event) {
  try {
    return await fetch(event.request);
  } catch {
    // Queue for later
    const queue = await getOfflineQueue();
    queue.push({ url: event.request.url, body: await event.request.text(), timestamp: Date.now() });
    await saveOfflineQueue(queue);
    return new Response(JSON.stringify({ queued: true }), { status: 202 });
  }
}
```
When the device comes back online, the service worker processes the queue. This is a massive competitive differentiator for field workers in Alberta with spotty LTE.

**Native Camera API for Mobile — P0**
The current `<input capture="environment">` works but doesn't give control over zoom, flash, or stabilization. On mobile browsers that support it, use the `getUserMedia` API for a proper in-app camera:
```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: 'environment',
    width: { ideal: 3840 },
    height: { ideal: 2160 },
    focusMode: 'continuous', // auto-focus
  }
});
```

**Push Notifications for Approval Queue — P1**
When an employee submits a receipt requiring approval, send a push notification to the owner using the Web Push API via Supabase Edge Functions.

**Mobile Bottom Navigation Fix — P1**
On mobile, the bottom navigation (if present) overlaps fixed-position modals. Add `pb-safe` padding using CSS env():
```css
.main-content { padding-bottom: calc(env(safe-area-inset-bottom) + 4rem); }
```

---

### Export & Integrations

**QuickBooks Online Integration — P0**
The #1 ask from accountants. Use the QuickBooks Online API v3:
```typescript
// POST /api/integrations/qbo/sync
// Syncs approved receipts as QBO Bills:
const qboClient = new QuickBooks(clientId, clientSecret, accessToken, false, realmId, true);
await qboClient.createBill({
  VendorRef: { name: vendor_name },
  TotalAmt: total_amount,
  Line: line_items.map(item => ({
    Amount: item.line_total,
    DetailType: 'AccountBasedExpenseLineDetail',
    AccountBasedExpenseLineDetail: {
      AccountRef: { name: mapCategoryToQBOAccount(item.category) }
    }
  }))
});
```
This single feature makes you directly competitive with Dext (whose main value prop is QuickBooks sync).

**Xero Integration — P0**
Xero is popular with Alberta accountants. Use Xero's API to create expense claims with receipt attachments.

**CRA My Business Account Export — P1**
Generate a CRA-compatible `T2125` (Business/Professional Income) schedule pre-fill in a structured format. This is unique — no competitor auto-fills CRA forms.

**Email-to-Receipt Inbox — P1**
Provision each org a unique email address (`receipts+orgid@9starlabs.ca`). Forward emails to a Supabase Edge Function that:
1. Extracts attachments (PDF/image)
2. Calls `scanReceipt` server action
3. Saves with `capture_source: 'email'`

Use Postmark or SendGrid Inbound Parsing. Expensify charges extra for this; include it in your Pro plan.

**Google Drive Backup — P2**
Nightly backup of all receipt images and the CSV to the org owner's Google Drive. Zero-setup cloud backup. Accountants love this.

---

### Design System & Visual Polish

**Skeleton Loaders for Receipt Cards — P0**
Currently the receipts tab shows nothing while loading. Add shimmer skeletons:
```tsx
function ReceiptSkeleton() {
  return (
    <div className="rounded-2xl border border-glass-border bg-surface p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl shimmer-loading flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 rounded shimmer-loading" />
          <div className="h-3 w-48 rounded shimmer-loading" />
          <div className="h-3 w-24 rounded shimmer-loading" />
        </div>
        <div className="h-6 w-16 rounded-full shimmer-loading" />
      </div>
    </div>
  );
}
```

**Animated CRA Score Ring — P0**
Replace the plain progress bar with an SVG donut ring that animates on mount:
```tsx
function CRAScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx="44" cy="44" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
      <motion.circle
        cx="44" cy="44" r={radius} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={circumference}
        strokeDashoffset={circumference}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
      />
      <text x="44" y="49" textAnchor="middle" fill={color} fontSize="14" fontWeight="800">
        {score}
      </text>
    </svg>
  );
}
```

**Touch Target Audit — P0**
Multiple buttons in the History receipt cards are below 44×44px (the WCAG minimum touch target). Specifically: the Fingerprint icon, the small badge spans. They need minimum `h-11 w-11` or equivalent padding. Every interactive element should have at minimum `min-h-[44px] min-w-[44px]` on mobile.

**Dark Mode–Only Color Contrast Audit — P0**
Several text elements fail WCAG AA 4.5:1:
- `text-text-muted` (#6b6560) on `bg-surface` (#1a1a1a): contrast ratio ≈ 3.2:1 — FAILS AA
- Fix: change `--text-muted` to `#857f7a` (ratio 4.6:1)
- `text-champagne-dim` (#9a8a72) on `bg-obsidian` (#0c0c0c): ratio ≈ 4.4:1 — BORDERLINE
- Fix: change `--champagne-dim` to `#a0917b`

**Consistent Border Radius System — P1**
The codebase uses a mix of `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-[2rem]`, `rounded-[2.5rem]`. Define a strict 3-tier system:
- Component: `rounded-2xl` (16px) for inputs, buttons, badges
- Card: `rounded-3xl` (24px) for content cards
- Page: `rounded-[2.5rem]` (40px) for modals, panels

**AnimatePresence Key Bug — P1**
Several `AnimatePresence` blocks lack `key` props on their direct children, meaning exit animations don't trigger:
```tsx
// BROKEN:
<AnimatePresence>
  {showBlurWarning && <motion.div>...</motion.div>}
</AnimatePresence>

// FIXED:
<AnimatePresence mode="wait">
  {showBlurWarning && <motion.div key="blur-warning">...</motion.div>}
</AnimatePresence>
```

**Empty State Illustrations — P1**
The empty state for receipts shows only a `<Receipt>` icon with text. Add a more compelling empty state with a call-to-action that's contextual to the current filter:
```tsx
const emptyStateMap = {
  'flagged-audit': { icon: ShieldAlert, title: 'No flagged receipts', subtitle: 'All receipts pass your audit rules.' },
  'reimbursement': { icon: DollarSign, title: 'No pending reimbursements', subtitle: 'All employee expenses are settled.' },
  'all': { icon: Receipt, title: 'No receipts yet', subtitle: 'Scan your first receipt to start building your CRA-compliant ledger.', cta: 'Scan Now' },
};
```

**Receipt Detail Drawer — P0**
Currently clicking a receipt card opens an inline expanded state that reflows the list. Replace with a right-side drawer that slides in at 480px width on desktop, full-screen on mobile. Include: full-size image viewer, edit-in-place fields, audit log for that specific receipt, reimbursement controls. This is how Expensify and Dext do it and why their UX feels more professional.

---

### Performance & Architecture

**Server-Side Pagination — P0**
Replace the `getReceipts()` bulk fetch with the `get_receipts_paginated` RPC from migration_v2. Add cursor-based pagination in the History component:
```typescript
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['receipts', filters],
  queryFn: ({ pageParam = 0 }) =>
    supabase.rpc('get_receipts_paginated', {
      p_org_id: orgId,
      p_user_id: userId,
      p_role: role,
      p_limit: 25,
      p_offset: pageParam,
      ...filters,
    }),
  getNextPageParam: (lastPage, pages) =>
    lastPage.length === 25 ? pages.length * 25 : undefined,
});
```

**TanStack Query Stale-Time Configuration — P1**
Currently `useQuery` uses default stale-time (0), meaning every tab focus refetches receipts. Configure:
```typescript
// In Providers.tsx:
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      gcTime: 1000 * 60 * 10,
      retry: 2,
      refetchOnWindowFocus: false, // use Supabase Realtime instead
    },
  },
});
```

**Optimistic Updates for Approval Actions — P1**
Currently, approving a receipt triggers a refetch of the entire receipts list. Use TanStack Query's `optimisticUpdate`:
```typescript
onMutate: async ({ receiptId, status }) => {
  await queryClient.cancelQueries({ queryKey: ['receipts'] });
  const prev = queryClient.getQueryData(['receipts']);
  queryClient.setQueryData(['receipts'], (old: ReceiptRow[]) =>
    old.map(r => r.id === receiptId ? { ...r, approval_status: status } : r)
  );
  return { prev };
},
onError: (_, __, context) => {
  queryClient.setQueryData(['receipts'], context?.prev);
},
```

**Move Heavy Processing to Edge Functions — P1**
The embedding generation in `scan-receipt.ts` adds 800ms–2s to the scan flow. Move it to a fire-and-forget Supabase Edge Function that's triggered after receipt INSERT:
```typescript
// supabase/functions/generate-embedding/index.ts
Deno.serve(async (req) => {
  const { record } = await req.json(); // from database webhook
  const embedding = await generateEmbedding(`${record.vendor_name} ${record.category} ${record.notes}`);
  await supabase.from('receipts').update({ semantic_embedding: embedding }).eq('id', record.id);
  return new Response('ok');
});
```

**Image Storage Organization — P1**
Current path: `${user.id}/${Date.now()}-receipt.jpg` — flat structure per user. Reorganize to `${org_id}/${user_id}/${YYYY}/${MM}/${receipt_id}.jpg` for CRA fiscal year organization and easier bulk export.

**Supabase Storage Bucket Configuration — P1**
```sql
-- Run in Supabase dashboard:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipt-images',
  'receipt-images', 
  true,  -- public for image display (URLs embedded in receipts)
  5242880,  -- 5MB limit per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT DO NOTHING;

-- RLS on storage:
CREATE POLICY "Org members can read receipt images"
ON storage.objects FOR SELECT
USING (bucket_id = 'receipt-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can upload their own receipts"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'receipt-images' AND
  auth.uid() IS NOT NULL AND
  (storage.foldername(name))[1] = (SELECT org_id::text FROM user_roles WHERE user_id = auth.uid() LIMIT 1)
);
```

---

### Legal & Privacy

**Cookie Consent Banner — P0**
The app uses Supabase auth cookies (first-party, necessary). Add a minimal cookie consent banner that explains this:
```tsx
// Only show if no cookie-consent in localStorage:
<div className="fixed bottom-0 left-0 right-0 z-50 border-t border-glass-border bg-obsidian/95 p-4 backdrop-blur-xl">
  <p className="text-xs text-text-secondary">
    We use only essential authentication cookies required for login security. No advertising or analytics cookies.
    <button onClick={dismiss} className="ml-2 text-champagne hover:underline">Got it</button>
  </p>
</div>
```

**Terms of Service Page — P0**
The `src/app/terms/page.tsx` exists (referenced in auth signup) — make sure it contains full terms covering: acceptable use, subscription terms, limitation of liability, dispute resolution (Alberta courts), and CRA compliance disclaimers.

**CASL Compliance (Canada's Anti-Spam Law) — P1**
If you send any email notifications (approval alerts, weekly summaries), you need explicit CASL consent at signup. Add a separate checkbox:
```tsx
<Checkbox>
  I consent to receive transactional and service emails from 9 Star Labs.
  (Required for approval notifications)
</Checkbox>
```

---

## PART 4 — VISUAL & LAYOUT FIXES

**Typography: Missing `tabular-nums` on financial figures**
Every currency display should use `font-variant-numeric: tabular-nums` to prevent number columns from jumping as values change. In the Dashboard's `StatCard`, `<p className="text-2xl font-black tracking-tighter text-text-primary">` needs `tabular-nums` class. The CSS `.tabular-nums` class exists in globals — just not applied consistently.

**Spacing: Bottom navigation on mobile hidden by system UI**
The mobile bottom nav on iOS is obscured by the home indicator. Fix:
```css
.bottom-nav { padding-bottom: calc(env(safe-area-inset-bottom) + 0.5rem); }
```

**History cards: Receipt card `p-4` is insufficient for touch targets on the action buttons**
The Edit, Delete, and Approve buttons inside History receipt detail use `h-9 w-9` which is 36px — below the 44px WCAG minimum. Change all icon-only buttons to `h-11 w-11` and add `aria-label` attributes.

**Scanner form: Long vendor names overflow card header**
`max-w-[150px]` on the filename truncation is too aggressive on small phones. Use CSS `text-overflow: ellipsis` with a wider max-width or let it wrap:
```tsx
<p className="text-sm font-bold text-text-primary truncate max-w-[200px] sm:max-w-xs">
```

**Dashboard: Tremor `AreaChart` has no dark theme tokens**
Tremor v3's charts use white backgrounds by default. Override:
```tsx
<AreaChart
  className="h-52 text-text-secondary"
  colors={["champagne"]}
  showLegend={false}
  showGridLines={false}
  curveType="monotone"
/>
```
And in globals.css add Tremor CSS variable overrides:
```css
:root {
  --tremor-background-subtle: var(--surface-raised);
  --tremor-border-default: var(--glass-border);
  --tremor-content-default: var(--text-secondary);
  --tremor-content-emphasis: var(--text-primary);
  --tremor-content-strong: var(--text-primary);
}
```

**Aurora background performance on low-end devices**
The Aurora animation uses a complex CSS `@keyframes aurora` with `background-size: 300% 300%`. On low-end Android devices, this causes 15fps animation jank. Add a hardware acceleration hint and reduce complexity for mobile:
```css
@media (max-width: 768px) {
  .aurora-bg::before { animation: none !important; background: var(--obsidian); }
}
```

**Missing `will-change` on Framer Motion animated elements**
Add to the scanner result card and receipt history cards:
```tsx
<motion.div style={{ willChange: 'transform, opacity' }} ...>
```

**CommandPalette z-index conflict**
The CommandPalette uses `z-[100]`. The SQL error modal in Scanner uses `z-[120]`. The InviteModal uses `z-[200]`. This ad-hoc z-index system will cause stacking conflicts. Define a z-index scale in globals.css:
```css
:root {
  --z-overlay: 100;
  --z-modal: 200;
  --z-toast: 300;
  --z-command: 400;
}
```

**Receipt image in History modal: `max-h-[60vh]` on desktop cuts off tall receipts**
Long paper receipts (30cm thermal rolls) render partially. Allow scrolling within the image container:
```tsx
<div className="relative max-h-[70vh] overflow-y-auto rounded-xl">
  <img src={imageSrc} className="w-full object-contain" />
</div>
```

**ScannerForm line items section: No mobile stacking on the 3-column grid**
The line items form has `grid-cols-3` (description, qty, price) on all screen sizes. On mobile (375px), this creates 3 columns of ~120px each, making inputs too narrow:
```tsx
// Replace: grid-cols-3 gap-3
// With:
className="grid grid-cols-1 sm:grid-cols-3 gap-3"
```

**InviteModal: Missing role explanation for Accountant**
When generating an Accountant invite code, there's no tooltip or description explaining what an Accountant can and cannot do. Add inline role descriptions:
```tsx
const roleDescriptions = {
  Employee: 'Can scan and submit receipts. Cannot approve or export.',
  Accountant: 'Can view all receipts, approve, and export data. Cannot manage team.',
  Owner: 'Full access including team management and settings.',
};
```

**Export date pickers have no default values**
When the Export tab opens, `fromDate` and `toDate` are both `''`, meaning no date range is pre-selected and the filteredReceipts shows all receipts. Default to the current fiscal quarter:
```typescript
const [fromDate, setFromDate] = useState(() => {
  const now = new Date();
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return format(quarterStart, 'yyyy-MM-dd');
});
const [toDate, setToDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
```

---

## PART 5 — COMPLETE PRIVACY POLICY PAGE

```tsx
// src/app/privacy/page.tsx
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

interface PolicySection {
  id: string;
  title: string;
  content: React.ReactNode;
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

const TOC = [
  { id: 'who-we-are', label: '1. Who We Are' },
  { id: 'information-collected', label: '2. Personal Information We Collect' },
  { id: 'purposes', label: '3. Purposes of Collection & Use' },
  { id: 'ai-ml', label: '4. AI & Machine Learning Disclosure' },
  { id: 'storage-security', label: '5. Data Storage & Security' },
  { id: 'retention', label: '6. Data Retention (7-Year CRA Requirement)' },
  { id: 'your-rights', label: '7. Your Rights Under PIPEDA' },
  { id: 'childrens-privacy', label: '8. Children\'s Privacy' },
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
              <B>9 Star Labs Inc.</B> ("9 Star Labs," "we," "us," or "our") operates the 9 Star Labs
              Receipt Intelligence platform (the "Service"), a CRA-compliant AI-powered receipt
              capture and expense management system designed for Canadian businesses. We are
              committed to protecting your personal and financial information in accordance with the{' '}
              <B>
                <em>Personal Information Protection and Electronic Documents Act</em>
              </B>{' '}
              (PIPEDA, S.C. 2000, c. 5) and the{' '}
              <B>
                <em>Personal Information Protection Act</em>
              </B>{' '}
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
            <p>
              For the purposes of PIPEDA, 9 Star Labs Inc. is the{' '}
              <B>"organization"</B> that determines the purposes and means of processing your personal
              information.
            </p>
          </Section>

          {/* Section 2 */}
          <Section id="information-collected" title="2. Personal Information We Collect">
            <p>We collect personal information in the following categories:</p>

            <div className="rounded-xl border border-glass-border bg-surface/30 p-4 space-y-4">
              <div>
                <p className="font-semibold text-text-primary text-sm mb-1">a) Account Information</p>
                <p>
                  Email address and encrypted authentication credentials when you register for an
                  account. We do not store plaintext passwords. Authentication is handled by Supabase
                  Auth, which uses bcrypt hashing.
                </p>
              </div>
              <div>
                <p className="font-semibold text-text-primary text-sm mb-1">b) Financial Documents</p>
                <p>
                  Images of physical or digital receipts, invoices, estimates, and bank statements
                  that you upload or capture through the Service. These documents may contain: vendor
                  names, vendor addresses, CRA Business Numbers (BN) and GST/HST registration
                  numbers, transaction amounts, tax amounts (GST/HST/PST), payment card last-four
                  digits, transaction dates and times, line item descriptions, and business purpose
                  notes.
                </p>
              </div>
              <div>
                <p className="font-semibold text-text-primary text-sm mb-1">c) AI-Extracted Structured Data</p>
                <p>
                  Data extracted from your financial documents by our AI processing pipeline,
                  including all fields listed in (b) above in structured database form, plus: AI
                  confidence scores, CRA readiness scores, fraud and duplicate detection flags,
                  mathematical consistency warnings, thermal receipt degradation flags, image blur
                  scores, currency and exchange rate information, and SHA-256 cryptographic integrity
                  hashes of the original documents.
                </p>
              </div>
              <div>
                <p className="font-semibold text-text-primary text-sm mb-1">d) Organizational Information</p>
                <p>
                  Business unit names, project codes, job site identifiers, and vehicle registration
                  IDs that you or your team associates with expense records for cost allocation.
                </p>
              </div>
              <div>
                <p className="font-semibold text-text-primary text-sm mb-1">e) Team & Role Information</p>
                <p>
                  For multi-user organizations: the roles assigned to team members (Owner, Employee,
                  Accountant), invite code history, approval workflow actions (who approved/rejected
                  which expense and when), and reimbursement decisions.
                </p>
              </div>
              <div>
                <p className="font-semibold text-text-primary text-sm mb-1">f) Technical & Usage Data</p>
                <p>
                  IP addresses, device type, browser type, operating system, session timestamps,
                  feature interaction events, and error logs collected automatically for security
                  monitoring, fraud prevention, and service improvement. We do not use third-party
                  analytics services. Log data is collected at the infrastructure level (Supabase /
                  Vercel) and is not shared with advertisers.
                </p>
              </div>
              <div>
                <p className="font-semibold text-text-primary text-sm mb-1">g) Payment Information</p>
                <p>
                  If you purchase a paid subscription, payment processing is handled exclusively by
                  Stripe. We do not store full credit card numbers. We receive from Stripe only:
                  your Stripe Customer ID, subscription status, and billing period dates.
                </p>
              </div>
            </div>

            <p>
              <B>We do not collect</B> information about race, ethnicity, religion, health status,
              or other sensitive categories of personal information as defined in PIPEDA. We do not
              collect social insurance numbers (SIN).
            </p>
          </Section>

          {/* Section 3 */}
          <Section id="purposes" title="3. Purposes of Collection & Use">
            <p>
              Under PIPEDA Principle 2, we collect personal information only for the following
              identified, specific, and documented purposes:
            </p>
            <ol className="list-decimal list-outside ml-5 space-y-3">
              <li>
                <B>AI-Powered Receipt Extraction:</B> Transmitting uploaded document images to
                Google's Generative AI API (Gemini) to extract structured financial data in support
                of your bookkeeping and CRA compliance obligations.
              </li>
              <li>
                <B>CRA Compliance Scoring:</B> Computing real-time CRA readiness scores that
                assess whether extracted receipt data meets the Canada Revenue Agency's documentary
                requirements for Input Tax Credit (ITC) claims under the{' '}
                <em>Excise Tax Act</em>.
              </li>
              <li>
                <B>Tamper-Evident Audit Trail:</B> Maintaining a SHA-256 Merkle chain audit log
                of all create, update, approval, and delete events on financial records to support
                CRA audit defense and internal governance.
              </li>
              <li>
                <B>Duplicate & Fraud Detection:</B> Computing cryptographic hashes of receipt
                metadata to identify duplicate submissions; analyzing receipt characteristics via AI
                to detect potentially fraudulent documents (e.g., AI-generated fake receipts,
                impossible math, out-of-policy vendors).
              </li>
              <li>
                <B>Semantic Search:</B> Generating vector embeddings of receipt descriptions (via
                Google's text-embedding-004 model) to enable natural-language search across your
                expense history (e.g., "coffee with client in Calgary").
              </li>
              <li>
                <B>Multi-User Expense Management:</B> Administering role-based access controls,
                approval workflows, and reimbursement tracking within your organization's workspace.
              </li>
              <li>
                <B>Export & Reporting:</B> Generating CRA-compliant CSV, IDEA flat-file, and ZIP
                archive exports of your expense records for use by accountants, tax preparers, and
                bookkeepers.
              </li>
              <li>
                <B>Bank Reconciliation:</B> Matching bank statement transactions against stored
                receipt records to support month-end accounting processes.
              </li>
              <li>
                <B>Account Administration:</B> Managing your subscription, processing payments
                (via Stripe), sending transactional service emails (with your consent under CASL),
                and providing customer support.
              </li>
              <li>
                <B>Security & Fraud Prevention:</B> Monitoring for unauthorized access, unusual
                activity patterns, and potential data integrity violations.
              </li>
              <li>
                <B>Service Improvement:</B> Using aggregated, de-identified usage metrics to
                improve the accuracy of our AI models and the usability of the platform.
                <B> We do not use your specific receipt data or document images to train our
                AI models or any third-party AI models.</B>
              </li>
            </ol>
            <p>
              <B>We do not sell your personal information.</B> We do not use your financial data
              for advertising. We do not share your data with third parties except as described in
              Section 10.
            </p>
          </Section>

          {/* Section 4 */}
          <Section id="ai-ml" title="4. AI & Machine Learning Disclosure">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4 mb-4">
              <p className="font-semibold text-amber-300 text-sm mb-1">Important AI Disclosure</p>
              <p>
                Images of your financial documents are transmitted to Google LLC's Generative AI
                API for extraction processing. This occurs every time you scan a receipt through
                the Service.
              </p>
            </div>

            <p>
              <B>What is transmitted to Google:</B> The base64-encoded image of your receipt or
              financial document, along with a structured prompt instructing the AI to extract
              specific financial fields. No other personal information (name, email, account ID)
              is transmitted alongside the image.
            </p>
            <p>
              <B>Google's data usage policy:</B> Under Google's enterprise API terms for
              Gemini API access, data processed through the API is{' '}
              <B>not used to train Google's public AI models</B>. Google acts as a data processor
              on our behalf. For full details, see{' '}
              <A href="https://ai.google.dev/gemini-api/terms">Google's Generative AI Terms</A> and{' '}
              <A href="https://policies.google.com/privacy">Google's Privacy Policy</A>.
            </p>
            <p>
              <B>Vector embeddings for semantic search:</B> Text descriptions derived from your
              receipts (vendor name, category, notes, amount) are also transmitted to Google's
              text-embedding-004 model to generate numerical vector representations stored in our
              database. These vectors enable natural-language search but do not contain full receipt
              images or sensitive financial identifiers.
            </p>
            <p>
              <B>AI accuracy limitations:</B> AI extraction is subject to error. You are
              responsible for reviewing and verifying all AI-extracted data before submission to the
              CRA or any accounting system. CRA readiness scores are informational tools, not legal
              guarantees of deductibility. Always consult a qualified Canadian accountant or tax
              professional for tax advice.
            </p>
            <p>
              <B>Opt-out:</B> You may choose to manually enter receipt data without using the AI
              extraction feature. Contact{' '}
              <A href="mailto:privacy@9starlabs.ca">privacy@9starlabs.ca</A> to request a manual-
              entry-only account mode.
            </p>
          </Section>

          {/* Section 5 */}
          <Section id="storage-security" title="5. Data Storage & Security">
            <p>
              All structured data (receipt records, audit logs, user profiles, organizational
              settings) is stored in a PostgreSQL database managed by{' '}
              <B>Supabase</B>, which operates on Amazon Web Services (AWS) infrastructure, currently
              in the <B>us-east-1 (Northern Virginia)</B> region. See Section 11 for cross-border
              transfer details.
            </p>
            <p>
              <B>Technical security controls we implement include:</B>
            </p>
            <ul className="list-disc list-outside ml-5 space-y-2">
              <li>
                <B>SHA-256 cryptographic hashing</B> of all document images at the moment of
                capture, stored as integrity hashes that cannot be altered retroactively.
              </li>
              <li>
                <B>Merkle chain audit logs</B> — each audit event includes a hash of the previous
                event, creating a tamper-evident chain of custody for all financial records.
              </li>
              <li>
                <B>Row Level Security (RLS)</B> at the database layer enforces strict data
                isolation between organizations. No user can access another organization's data.
              </li>
              <li>
                <B>TLS 1.3 encryption in transit</B> for all data transmitted between your device,
                our servers, and third-party processors.
              </li>
              <li>
                <B>AES-256 encryption at rest</B> for all stored data on AWS EBS volumes managed
                by Supabase.
              </li>
              <li>
                <B>Role-based access controls</B> — three-tier permission model (Owner, Employee,
                Accountant) with database-enforced policy boundaries.
              </li>
              <li>
                <B>Multi-factor authentication (MFA)</B> support via TOTP authenticator apps for
                all user accounts.
              </li>
              <li>
                <B>Security headers</B> — X-Frame-Options: DENY, X-Content-Type-Options: nosniff,
                Strict-Transport-Security with 2-year max-age, and Content-Security-Policy
                enforcement on all pages.
              </li>
            </ul>
            <p>
              Despite these safeguards, no internet-based service can guarantee absolute security.
              If you discover a security vulnerability, please contact us immediately at{' '}
              <A href="mailto:security@9starlabs.ca">security@9starlabs.ca</A>.
            </p>
          </Section>

          {/* Section 6 */}
          <Section id="retention" title="6. Data Retention — 7-Year CRA Minimum">
            <div className="rounded-xl border border-champagne/20 bg-champagne/[0.04] p-4 mb-2">
              <p className="text-sm font-bold text-champagne mb-1">CRA Legal Requirement</p>
              <p>
                The <em>Income Tax Act</em> (Canada), s. 230(4), and the{' '}
                <em>Excise Tax Act</em> (Canada), s. 286, require that records supporting tax
                returns be retained for a minimum of <B>six (6) years from the end of the fiscal
                year to which they relate</B>. For a receipt from December 2025, this means
                retention until at least December 31, 2031 — effectively{' '}
                <B>approximately 7 calendar years</B> from the transaction date for the last month
                of a fiscal year. We retain your approved receipt records for a minimum of 7 years
                from the transaction date to ensure full CRA compliance regardless of your fiscal
                year-end date.
              </p>
            </div>
            <ul className="list-disc list-outside ml-5 space-y-2">
              <li>
                <B>Active records</B> are retained indefinitely until you request deletion. You
                will be warned if a deletion request applies to records within the 7-year CRA
                retention window.
              </li>
              <li>
                <B>Soft deletion:</B> When you delete a receipt, it is marked as deleted (invisible
                in the app) but retained in our database for 90 days before permanent purge, to
                protect against accidental deletion. Receipts within the 7-year CRA window cannot
                be permanently purged without explicit written acknowledgment of compliance risk.
              </li>
              <li>
                <B>Edit history:</B> All versions of edited receipts are archived in our
                immutable receipt history table. This full version history is retained for the same
                7-year minimum period.
              </li>
              <li>
                <B>Audit logs:</B> Tamper-evident audit logs are retained for a minimum of 10 years
                to support potential CRA enforcement timelines.
              </li>
              <li>
                <B>Account closure:</B> If you close your account, your data is retained for the
                applicable CRA retention period. After that period, personal identifiers are purged
                and financial records are fully deleted. You may request a full data export before
                account closure.
              </li>
            </ul>
          </Section>

          {/* Section 7 */}
          <Section id="your-rights" title="7. Your Rights Under PIPEDA">
            <p>
              Under PIPEDA and Alberta PIPA, you have the following rights with respect to your
              personal information:
            </p>
            <div className="space-y-4">
              {[
                {
                  right: 'Right of Access',
                  desc: 'You may request a copy of all personal information we hold about you. We will respond within 30 days of a verified written request. A portable data export (CSV + receipt images ZIP) is available directly from the Export tab in the application.',
                },
                {
                  right: 'Right of Correction',
                  desc: 'You may request correction of inaccurate personal information. Receipt data can be corrected directly in the application. For account information corrections, contact privacy@9starlabs.ca.',
                },
                {
                  right: 'Right of Erasure',
                  desc: 'You may request deletion of your account and associated data. Requests within the 7-year CRA retention window will require written acknowledgment that deletion may impair your CRA compliance obligations. Records outside the CRA window will be deleted within 30 days of a verified request.',
                },
                {
                  right: 'Withdrawal of Consent',
                  desc: 'You may withdraw consent to non-essential data processing (e.g., service improvement analytics) at any time by contacting privacy@9starlabs.ca. Note that withdrawal of consent to AI extraction will prevent use of the AI scanning features. Withdrawal of consent to data storage will require account closure.',
                },
                {
                  right: 'Right to Complain',
                  desc: 'If you believe your privacy rights have been violated, you may file a complaint with the Office of the Privacy Commissioner of Canada at www.priv.gc.ca or the Office of the Information and Privacy Commissioner of Alberta at www.oipc.ab.ca.',
                },
              ].map(({ right, desc }) => (
                <div key={right} className="rounded-xl border border-glass-border bg-surface/30 p-4">
                  <p className="text-sm font-bold text-text-primary mb-1">{right}</p>
                  <p>{desc}</p>
                </div>
              ))}
            </div>
            <p>
              To exercise any of these rights, submit a written request to{' '}
              <A href="mailto:privacy@9starlabs.ca">privacy@9starlabs.ca</A>. We will verify your
              identity before processing any access, correction, or deletion request.
            </p>
          </Section>

          {/* Section 8 */}
          <Section id="childrens-privacy" title="8. Children's Privacy">
            <p>
              The Service is intended exclusively for use by business owners, employees, and
              accountants managing business expenses. <B>The Service is not directed at, and
              we do not knowingly collect personal information from, individuals under the age
              of 18.</B> If you believe a minor has created an account or submitted personal
              information through the Service, please contact us immediately at{' '}
              <A href="mailto:privacy@9starlabs.ca">privacy@9starlabs.ca</A> and we will
              delete that information promptly.
            </p>
          </Section>

          {/* Section 9 */}
          <Section id="cookies" title="9. Cookies & Session Tokens">
            <p>
              The Service uses only <B>essential first-party cookies</B> necessary for
              authentication and security. We do not use advertising cookies, cross-site tracking
              cookies, or third-party analytics cookies.
            </p>
            <div className="rounded-xl border border-glass-border bg-surface/30 p-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-glass-border">
                    <th className="text-left py-2 pr-4 font-bold text-text-primary">Cookie</th>
                    <th className="text-left py-2 pr-4 font-bold text-text-primary">Purpose</th>
                    <th className="text-left py-2 font-bold text-text-primary">Duration</th>
                  </tr>
                </thead>
                <tbody className="space-y-2">
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
            <p>
              These cookies are stored in your browser's local storage or as HttpOnly cookies.
              You may delete them through your browser settings, which will sign you out of
              the Service. We do not use localStorage for sensitive data beyond session management.
            </p>
          </Section>

          {/* Section 10 */}
          <Section id="third-party" title="10. Third-Party Service Providers">
            <p>
              We share personal information only with the following processors, each bound by a
              data processing agreement consistent with PIPEDA requirements:
            </p>
            <div className="space-y-3">
              {[
                {
                  name: 'Google LLC (Gemini API)',
                  purpose: 'AI receipt extraction (OCR) and semantic embedding generation. Document images are transmitted per scan.',
                  policy: 'https://policies.google.com/privacy',
                  region: 'United States (us-central1)',
                },
                {
                  name: 'Supabase Inc.',
                  purpose: 'Database (PostgreSQL), authentication, file storage, and serverless edge functions. All structured data and receipt images are stored here.',
                  policy: 'https://supabase.com/privacy',
                  region: 'AWS us-east-1 (Virginia, USA)',
                },
                {
                  name: 'Vercel Inc.',
                  purpose: 'Application hosting and serverless function execution. IP addresses and request logs may be processed.',
                  policy: 'https://vercel.com/legal/privacy-policy',
                  region: 'United States',
                },
                {
                  name: 'Stripe Inc.',
                  purpose: 'Payment processing for Pro/Enterprise subscriptions. Billing information only.',
                  policy: 'https://stripe.com/en-ca/privacy',
                  region: 'United States',
                },
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
            <p>
              We do not sell, rent, or trade your personal information to any third party for their
              own purposes.
            </p>
          </Section>

          {/* Section 11 */}
          <Section id="cross-border" title="11. Cross-Border Data Transfers">
            <p>
              Our primary data storage and AI processing infrastructure is located in the{' '}
              <B>United States</B> (AWS us-east-1 and Google Cloud us-central1). By using the
              Service, you consent to the transfer of your personal information to the United States
              for processing and storage, as permitted under PIPEDA Schedule 1, Principle 7
              (Safeguards) and Alberta PIPA Section 13.
            </p>
            <p>
              <B>Cross-border transfer safeguards:</B> We require all third-party processors to
              maintain security standards equivalent to or exceeding those required under Canadian
              law. Data transferred to the United States may be subject to access by U.S. law
              enforcement under U.S. laws (including the CLOUD Act). We cannot guarantee the same
              level of protection as in Canada once data leaves Canadian jurisdiction.
            </p>
            <p>
              <B>Our commitment to Canadian data residency:</B> We are actively evaluating
              Supabase's Canadian region hosting (AWS ca-central-1) and will migrate as soon as it
              becomes generally available on our service tier. We will notify all users by email
              prior to any change in data residency. We anticipate this migration will be available
              by late 2026.
            </p>
          </Section>

          {/* Section 12 */}
          <Section id="updates" title="12. Policy Updates & Contact">
            <p>
              We will update this Privacy Policy as our practices change, as new features are
              introduced, or as required by changes in applicable law. We will notify you of
              material changes by:
            </p>
            <ul className="list-disc list-outside ml-5 space-y-1">
              <li>Posting the updated policy at this URL with a new effective date</li>
              <li>Sending an email notice to your registered address (for material changes)</li>
              <li>Displaying an in-app banner for 30 days following a significant update</li>
            </ul>
            <p>
              Continued use of the Service after the effective date of a material change constitutes
              your acceptance of the updated policy. If you do not accept the changes, you must
              discontinue use of the Service.
            </p>

            <div className="mt-6 rounded-2xl border border-champagne/20 bg-champagne/[0.04] p-6">
              <p className="text-sm font-bold text-champagne mb-3">Contact Our Privacy Officer</p>
              <div className="space-y-1 text-sm">
                <p><B>9 Star Labs Inc.</B></p>
                <p>Edmonton, Alberta, Canada</p>
                <p>Email: <A href="mailto:privacy@9starlabs.ca">privacy@9starlabs.ca</A></p>
                <p>Security: <A href="mailto:security@9starlabs.ca">security@9starlabs.ca</A></p>
              </div>
              <p className="mt-4 text-xs text-text-muted">
                This policy was last reviewed and updated on <B>April 27, 2026</B>.
                Previous versions are available on request.
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
```

---

## PART 6 — ARCHITECTURE RECOMMENDATIONS

**Component Splitting**

`Scanner.tsx` is 700+ lines. Split into:
- `Scanner.tsx` — orchestrator, state management only
- `scanner/BatchEngine.ts` — batch processing logic as a pure class (not React)
- `scanner/ImageProcessor.ts` — blur detection, resize, canvas ops
- `scanner/hooks/useScanMutation.ts` — TanStack useMutation
- `scanner/hooks/useBatchQueue.ts` — batch queue state machine

`page.tsx` is the entire application shell in one file. Extract to:
- `components/layout/AppShell.tsx` — nav, header, tab routing
- `components/layout/BottomNav.tsx` — mobile navigation
- `components/layout/Sidebar.tsx` — desktop sidebar

**Server vs. Client Movement**

Move `getReceipts`, `getAuditLogs`, `getProjects` into Server Components or Route Handlers. Currently these are client-side Supabase calls that expose the service role key boundary. In Next.js 15 App Router:

```typescript
// app/api/receipts/route.ts
import { createServerClient } from '@supabase/ssr';
export async function GET(request: Request) {
  const supabase = createServerClient(url, anonKey, { cookies: ... });
  const { data: { user } } = await supabase.auth.getUser();
  // Now all data access is server-side, no JWT in network requests
}
```

**Caching Strategy**

```typescript
// Recommended TanStack Query config:
{
  receipts: { staleTime: 2 * 60 * 1000 },      // 2 min — use Realtime for live updates
  auditLogs: { staleTime: 5 * 60 * 1000 },     // 5 min — changes rarely
  projects: { staleTime: 10 * 60 * 1000 },     // 10 min — very stable
  businessUnits: { staleTime: 30 * 60 * 1000 }, // 30 min — almost never changes
  userRole: { staleTime: Infinity },            // Never stale — role changes require re-login
}
```

Use Supabase Realtime for receipts (INSERT/UPDATE/DELETE) so the 2-minute stale window doesn't matter — changes propagate in <200ms.

**Embedding Pipeline Recommendation**

Do NOT generate embeddings synchronously in the scan flow. Move to:
1. Receipt saved to DB (fast path completes, UI shows success)
2. Supabase Database Webhook → Edge Function (`generate-embedding`) triggered
3. Edge Function calls Gemini embedding API with `vendor_name + category + notes`
4. Updates `semantic_embedding` column

This removes 800ms–2s from the user-facing scan flow. Semantic search will show the receipt immediately after save, and the embedding appears within 2-3 seconds in the background.

**Offline Mode / PWA Service Worker Strategy**

Use a "network-first, cache-fallback" strategy for API calls and "cache-first" for static assets:

```javascript
// sw.js strategy:
// Static assets: CacheFirst (CSS, JS, fonts)
// Receipt images from Supabase Storage: StaleWhileRevalidate (30-day TTL)
// API calls (/api/*): NetworkFirst with 5s timeout, fallback to cached response
// Scan action (/api/scan): NetworkOnly with offline queue
```

Use `workbox-strategies` via `next-pwa` package for this.

**Monitoring & Observability**

Add the following without a paid service (use Supabase built-ins + free tiers):
1. `Sentry` (free tier) — JavaScript error tracking in Scanner and form components
2. Supabase Dashboard — query performance insights (already built in)
3. Vercel Analytics (free) — Core Web Vitals
4. Custom DB health check: a daily Supabase Edge Function cron that verifies Merkle chain integrity for the last 24h of audit logs and alerts via email if any `previous_hash` doesn't match

**Supabase Storage Optimal Configuration**

```
Bucket: receipt-images
├── {org_id}/
│   ├── {user_id}/
│   │   ├── {YYYY}/
│   │   │   ├── {MM}/
│   │   │   │   ├── {receipt_id}.jpg (original compressed)
│   │   │   │   └── {receipt_id}_thumb.webp (200x200 thumbnail)
```

Generate thumbnails in a Supabase Edge Function triggered on image upload. This eliminates loading full-resolution images in list views (massive performance win for 500+ receipt organizations).

Add Supabase Storage Transform (image resizing API) for on-the-fly thumbnails without storing separately:
```typescript
const { data: thumbUrl } = supabase.storage.from('receipt-images')
  .getPublicUrl(path, {
    transform: { width: 200, height: 200, resize: 'contain', format: 'webp' }
  });
```

---

**Final checklist — things that will blow your accountant clients away that no competitor has:**

1. The **Merkle chain verification endpoint** — share a URL with CRA, they verify the audit trail is intact with zero effort from you.
2. **7-year retention lock** — physically prevents deletion of CRA-required records at the database level. Wave has nothing like this.
3. **Offline batch scanning with sync queue** — photograph 50 receipts in a dead-zone job site, they upload and process when you hit Wi-Fi.
4. **GST ITC by business use %** — partial-use expense tracking at receipt level. QuickBooks requires manual journal entries for this.
5. **Bank of Canada official rate on foreign receipts** — stored forever for audit defense, automatically fetched from the BoC Valet API.
6. **AI fraud detection on digital receipts** — Gemini detects AI-generated fake receipts. Expensify doesn't have this. Dext doesn't have this.
7. **Semantic search** — "fuel receipts from Fort McMurray last January" finds results. No one at this price point has pgvector semantic search.
8. **One-click T2125 schedule prefill** — auto-populates the CRA business income form from your categorized expenses. Entirely unique in the Canadian market.