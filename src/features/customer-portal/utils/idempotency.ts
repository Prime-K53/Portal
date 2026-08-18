/**
 * Prime PORTAL — Order Submission Idempotency
 *
 * One logical order-submission attempt carries ONE Idempotency-Key. The ERP
 * (middleware/idempotency.cjs) scopes keys to the authenticated portal user,
 * stores the first response for 24h, and replays it when the same key is sent
 * again — so a retry after a lost response never creates a duplicate request.
 *
 * Rules honored here:
 *   - a new key is generated at the START of a logical submission attempt;
 *   - a retry of the SAME attempt reuses the SAME key (the ERP decides);
 *   - a NEW order gets a NEW key;
 *   - the key contains no customer data or other sensitive information;
 *   - no local idempotency database — the ERP remains authoritative.
 */

/**
 * Generates an Idempotency-Key for one logical order submission.
 *
 * UUID v4 via crypto.randomUUID() (built-in, no dependencies). The ERP accepts
 * 8–128 character keys; a 36-char UUID fits. Falls back to a UUID v4 built
 * from crypto.getRandomValues() when randomUUID is unavailable (non-secure
 * context — localhost and modern hosts are secure contexts).
 */
export function generateIdempotencyKey(): string {
  const random = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return random();
}
