import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCrashTraceListing } from '../main/adb/parsers/CrashTraceParser';

test('parses file listing into crash trace files', () => {
  const output = ['.', '..', 'anr_2024-01-01-12-00-00', 'anr_2024-01-02-08-30-00'].join('\n');
  const files = parseCrashTraceListing(output, '/data/anr/', 'anr');
  assert.equal(files.length, 2);
  assert.equal(files[0].name, 'anr_2024-01-01-12-00-00');
  assert.equal(files[0].path, '/data/anr/anr_2024-01-01-12-00-00');
  assert.equal(files[0].kind, 'anr');
});

test('empty output produces empty list', () => {
  assert.deepEqual(parseCrashTraceListing('', '/data/tombstones/', 'tombstone'), []);
});

test('blank lines are skipped', () => {
  const output = ['tombstone_00', '', '  ', 'tombstone_01'].join('\n');
  const files = parseCrashTraceListing(output, '/data/tombstones/', 'tombstone');
  assert.equal(files.length, 2);
});
