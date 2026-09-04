import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timestampForFilename } from '../main/util/timestamp';

test('pads single-digit components with zero', () => {
  const date = new Date(2024, 0, 5, 9, 3, 7); // 2024-01-05 09:03:07
  assert.equal(timestampForFilename(date), '2024-01-05-090307');
});

test('does not pad already double-digit components', () => {
  const date = new Date(2024, 11, 31, 23, 59, 58); // 2024-12-31 23:59:58
  assert.equal(timestampForFilename(date), '2024-12-31-235958');
});
