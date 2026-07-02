// Verification unit tests for waybill pattern and cryptographic hashing rules
const crypto = require('crypto');

function generateWaybillNumber(existingWaybills) {
  let maxNum = 0;
  const pattern = /^M(\d{5})$/;
  existingWaybills.forEach(num => {
    if (!num) return;
    const match = num.trim().match(pattern);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val > maxNum) {
        maxNum = val;
      }
    }
  });
  const nextVal = maxNum + 1;
  return `M${String(nextVal).padStart(5, '0')}`;
}

function calculateSignatureHash(signatureBytes, clientUuid, deliveredAt, signatureName, driverId) {
  const dataToHash = `${signatureBytes}|${clientUuid}|${deliveredAt}|${signatureName}|${driverId}`;
  return crypto.createHash('sha256').update(dataToHash).digest('hex');
}

function runTests() {
  console.log('--- Starting Waybill & Hash Verification Tests ---');

  // Test 1: Waybill Format
  const waybill = generateWaybillNumber(['M00001', 'M00002']);
  console.log(`Generated sample waybill: ${waybill}`);
  const pattern = /^M\d{5}$/;
  const isMatch = pattern.test(waybill);
  
  if (isMatch && waybill === 'M00003') {
    console.log('✅ Test 1 Passed: Waybill matches required pattern (M##### starting at M00001)');
  } else {
    console.error(`❌ Test 1 Failed: Waybill does not match pattern. Got: ${waybill}`);
    process.exit(1);
  }

  // Test 2: Signature Hashing Tamper-Evidence
  const clientUuid = '48d1c9ef-b31c-43f1-bf63-128a1c97a552';
  const deliveredAt = '2026-07-01T11:40:00Z';
  const signatureName = 'John Doe';
  const driverId = 'drv-01';

  const sigImageA = 'data:image/svg+xml;base64,drawing_vector_content_A';
  const sigImageB = 'data:image/svg+xml;base64,drawing_vector_content_B'; // Swapped image

  const hashA = calculateSignatureHash(sigImageA, clientUuid, deliveredAt, signatureName, driverId);
  const hashB = calculateSignatureHash(sigImageB, clientUuid, deliveredAt, signatureName, driverId);

  console.log(`Hash A: ${hashA}`);
  console.log(`Hash B (Swapped Signature): ${hashB}`);

  if (hashA !== hashB) {
    console.log('✅ Test 2 Passed: SHA-256 hash successfully detects signature image changes (tamper-evident)');
  } else {
    console.error('❌ Test 2 Failed: Hash did not change when signature image was swapped.');
    process.exit(1);
  }

  console.log('--- All Verification Tests Passed Successfully ---');
}

runTests();
