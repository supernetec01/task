import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestKey } from '../web/request-key.js';
test('LAN HTTP fallback generates distinct UUID v4 keys using cryptographic entropy', () => {
  const source = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
  const values = new Set(Array.from({ length: 1000 }, () => requestKey(source)));
  assert.equal(values.size, 1000);
  for (const value of values)
    assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('Secure-context randomUUID remains supported', () => {
  const expected = globalThis.crypto.randomUUID();
  assert.equal(
    requestKey({
      randomUUID: () => expected,
      getRandomValues: () => {
        throw Error('Unexpected fallback');
      },
    }),
    expected,
  );
});
test('Unavailable crypto fails explicitly instead of using weak Math.random keys', () => {
  assert.throws(() => requestKey({} as Crypto), /cập nhật trình duyệt/);
});
