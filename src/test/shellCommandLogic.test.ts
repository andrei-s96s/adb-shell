import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRawAdbCommand } from '../main/adb/shellCommandLogic';

test('non-adb-prefixed input is left for the device shell', () => {
  assert.equal(parseRawAdbCommand('id'), undefined);
  assert.equal(parseRawAdbCommand('pm list packages'), undefined);
});

test('adb-prefixed input is routed as a raw adb command, case-insensitively', () => {
  assert.equal(parseRawAdbCommand('adb root'), 'root');
  assert.equal(parseRawAdbCommand('ADB remount'), 'remount');
  assert.equal(parseRawAdbCommand('Adb shell pm list packages'), 'shell pm list packages');
});

test('does not false-positive on words merely starting with "adb"', () => {
  assert.equal(parseRawAdbCommand('adbd status'), undefined);
});

test('strips -d/-e device-selection flags, same as macrosLogic.parseSteps', () => {
  assert.equal(parseRawAdbCommand('adb -d shell foo'), 'shell foo');
  assert.equal(parseRawAdbCommand('adb -e install x.apk'), 'install x.apk');
});

test('strips -s <serial> and the serial token itself', () => {
  assert.equal(parseRawAdbCommand('adb -s R58N30ABCDE shell foo'), 'shell foo');
});

test('returns undefined for a step that is only -s <serial> with nothing after', () => {
  assert.equal(parseRawAdbCommand('adb -s R58N30ABCDE'), undefined);
});

test('returns undefined for "adb " with nothing meaningful after it', () => {
  assert.equal(parseRawAdbCommand('adb '), undefined);
  assert.equal(parseRawAdbCommand('adb    '), undefined);
});
