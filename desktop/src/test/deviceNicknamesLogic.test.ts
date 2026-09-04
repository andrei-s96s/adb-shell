import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySetNickname } from '../main/deviceNicknames/deviceNicknamesLogic';

test('sets a trimmed nickname for a serial', () => {
  const result = applySetNickname({}, 'SERIAL1', '  Head unit  ');
  assert.deepEqual(result, { SERIAL1: 'Head unit' });
});

test('empty name removes the nickname entirely', () => {
  const result = applySetNickname({ SERIAL1: 'Head unit' }, 'SERIAL1', '   ');
  assert.deepEqual(result, {});
});

test('other serials are untouched', () => {
  const result = applySetNickname({ OTHER: 'Kept' }, 'SERIAL1', 'New');
  assert.deepEqual(result, { OTHER: 'Kept', SERIAL1: 'New' });
});
