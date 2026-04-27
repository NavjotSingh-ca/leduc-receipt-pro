export async function generateSHA256(dataString: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(dataString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

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

  return generateSHA256(normalized);
}

export async function generateIntegrityHash(fileBuffer: BufferSource): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generateAuditEventHash(
  previousHash: string,
  eventData: Record<string, unknown>
): Promise<string> {
  // Merkle-chain logic: Hash(Previous_Hash || Stringified_Event)
  const canonicalData = JSON.stringify(eventData, Object.keys(eventData).sort());
  return generateSHA256(`[${previousHash}]-[${canonicalData}]`);
}
