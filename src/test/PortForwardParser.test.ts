import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseForwardList, parseReverseList } from '../main/adb/parsers/PortForwardParser';

test('parses forward --list line', () => {
  const rules = parseForwardList('emulator-5554 tcp:8000 tcp:9000\n', 'emulator-5554');
  assert.equal(rules.length, 1);
  assert.equal(rules[0].direction, 'forward');
  assert.equal(rules[0].hostSpec, 'tcp:8000');
  assert.equal(rules[0].deviceSpec, 'tcp:9000');
});

test('parses reverse --list line with swapped columns', () => {
  // adb reverse --list prints "<serial> <remote> <local>".
  const rules = parseReverseList('emulator-5554 tcp:9000 tcp:8000\n', 'emulator-5554');
  assert.equal(rules.length, 1);
  assert.equal(rules[0].direction, 'reverse');
  assert.equal(rules[0].deviceSpec, 'tcp:9000');
  assert.equal(rules[0].hostSpec, 'tcp:8000');
});

test('ignores lines for other serials', () => {
  const output = 'other-device tcp:1 tcp:2\nemulator-5554 tcp:8000 tcp:9000\n';
  const rules = parseForwardList(output, 'emulator-5554');
  assert.equal(rules.length, 1);
  assert.equal(rules[0].hostSpec, 'tcp:8000');
});

test('empty output produces empty list', () => {
  assert.deepEqual(parseForwardList('', 'emulator-5554'), []);
});

test('malformed lines are skipped', () => {
  const output = 'garbage line\nemulator-5554 tcp:8000 tcp:9000\n';
  const rules = parseForwardList(output, 'emulator-5554');
  assert.equal(rules.length, 1);
});
