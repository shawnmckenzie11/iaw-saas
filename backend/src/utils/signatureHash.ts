import crypto from 'crypto';

/** Inputs used to bind a signature image to its waybill delivery context. */
export interface SignatureHashInput {
  /** Raw signature image file bytes (PNG/JPEG). */
  imageBytes: Buffer;
  clientSideUuid: string;
  deliveredAt?: string | Date | null;
  signatureName?: string | null;
  driverId?: string | null;
}

/**
 * Computes a SHA-256 tamper-evidence hash over signature image bytes plus
 * waybill delivery metadata (client UUID, deliveredAt, signer name, driver id).
 */
export function computeSignatureHash(input: SignatureHashInput): string {
  const deliveredAtIso = input.deliveredAt
    ? new Date(input.deliveredAt).toISOString()
    : '';

  return crypto
    .createHash('sha256')
    .update(input.imageBytes)
    .update('|')
    .update(input.clientSideUuid)
    .update('|')
    .update(deliveredAtIso)
    .update('|')
    .update(input.signatureName ?? '')
    .update('|')
    .update(input.driverId ?? '')
    .digest('hex');
}

/**
 * Verifies that stored signature bytes still match the recorded hash.
 */
export function verifySignatureHash(
  input: SignatureHashInput,
  expectedHash: string | null | undefined
): boolean {
  if (!expectedHash) return false;
  const actual = computeSignatureHash(input);
  if (actual.length !== expectedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expectedHash));
}
