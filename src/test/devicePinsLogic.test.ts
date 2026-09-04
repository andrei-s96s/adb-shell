import { test } from 'node:test';
import assert from 'node:assert/strict';
import { togglePin } from '../main/devicePins/devicePinsLogic';

test('pinning an unpinned serial appends it', () => {
  assert.deepEqual(togglePin([], 'A'), ['A']);
  assert.deepEqual(togglePin(['A'], 'B'), ['A', 'B']);
});

test('toggling an already-pinned serial removes it, keeping order of the rest', () => {
  assert.deepEqual(togglePin(['A', 'B', 'C'], 'B'), ['A', 'C']);
});
