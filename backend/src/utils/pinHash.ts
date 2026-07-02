import crypto from 'crypto';

/**
 * Hashes a driver PIN using SHA-256 for comparison against stored pin_hash values.
 */
export function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

/**
 * Validates that a PIN is exactly four numeric digits.
 */
export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}
