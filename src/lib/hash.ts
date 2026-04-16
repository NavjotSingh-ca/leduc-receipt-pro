export async function generateDuplicateHash(
  vendor: string,
  date: string,
  total: string | number,
): Promise<string> {
  const normalized = [
    vendor.toLowerCase().trim().replace(/\s+/g, ' '),
    date.trim(),
    Number(total).toFixed(2),
  ].join('|');

  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
