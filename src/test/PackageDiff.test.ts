import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparePackages } from '../main/adb/parsers/PackageDiff';

test('finds only-in-each-side', () => {
  const result = comparePackages(['com.a', 'com.common', 'com.x'], ['com.b', 'com.common']);
  assert.deepEqual(result.onlyInA, ['com.a', 'com.x']);
  assert.deepEqual(result.onlyInB, ['com.b']);
  assert.equal(result.commonCount, 1);
});

test('identical lists produce no diff', () => {
  const result = comparePackages(['com.a', 'com.b'], ['com.b', 'com.a']);
  assert.deepEqual(result.onlyInA, []);
  assert.deepEqual(result.onlyInB, []);
  assert.equal(result.commonCount, 2);
});

test('empty lists produce empty diff', () => {
  const result = comparePackages([], []);
  assert.deepEqual(result.onlyInA, []);
  assert.deepEqual(result.onlyInB, []);
  assert.equal(result.commonCount, 0);
});
