import { computeSignatureHash, verifySignatureHash } from './signatureHash';

describe('computeSignatureHash', () => {
  const base = {
    imageBytes: Buffer.from('signature-png-bytes'),
    clientSideUuid: 'uuid-1',
    deliveredAt: '2026-07-02T18:00:00.000Z',
    signatureName: 'Jane Receiver',
    driverId: 'drv-01',
  };

  it('hashes image bytes together with waybill metadata', () => {
    const hash = computeSignatureHash(base);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifySignatureHash(base, hash)).toBe(true);
  });

  it('changes when image bytes change', () => {
    const original = computeSignatureHash(base);
    const tampered = computeSignatureHash({
      ...base,
      imageBytes: Buffer.from('tampered-png-bytes'),
    });
    expect(tampered).not.toBe(original);
    expect(verifySignatureHash({ ...base, imageBytes: Buffer.from('tampered-png-bytes') }, original)).toBe(
      false
    );
  });

  it('changes when metadata changes', () => {
    const original = computeSignatureHash(base);
    expect(computeSignatureHash({ ...base, signatureName: 'Other' })).not.toBe(original);
    expect(computeSignatureHash({ ...base, driverId: 'drv-02' })).not.toBe(original);
    expect(computeSignatureHash({ ...base, clientSideUuid: 'uuid-2' })).not.toBe(original);
  });
});
