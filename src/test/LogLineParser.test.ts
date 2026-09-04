import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLogLine } from '../main/adb/parsers/LogLineParser';
import { LogLevel } from '../main/adb/types/LogLine';

test('parses threadtime format', () => {
  const raw = '08-23 23:10:15.123  1234  1234 D ActivityManager: Displayed com.example.app/.MainActivity';
  const line = parseLogLine(raw);
  assert.equal(line?.timestamp, '08-23 23:10:15.123');
  assert.equal(line?.pid, '1234');
  assert.equal(line?.tid, '1234');
  assert.equal(line?.level, LogLevel.Debug);
  assert.equal(line?.tag, 'ActivityManager');
  assert.equal(line?.message, 'Displayed com.example.app/.MainActivity');
});

test('parses error level', () => {
  const raw = '08-23 23:10:16.001  5555  5678 E AndroidRuntime: FATAL EXCEPTION: main';
  const line = parseLogLine(raw);
  assert.equal(line?.level, LogLevel.Error);
  assert.equal(line?.tag, 'AndroidRuntime');
});

test('level ordering for filtering', () => {
  assert.ok(LogLevel.Error > LogLevel.Info);
  assert.ok(LogLevel.Verbose < LogLevel.Debug);
  assert.ok(LogLevel.Fatal >= LogLevel.Error);
});

test('unparsable line falls back to raw message', () => {
  const raw = '--------- beginning of main';
  const line = parseLogLine(raw);
  assert.equal(line?.message, raw);
  assert.equal(line?.tag, undefined);
  assert.equal(line?.level, LogLevel.Info);
});

test('empty line returns null', () => {
  assert.equal(parseLogLine('   '), null);
  assert.equal(parseLogLine(''), null);
});

test('message with colon inside is preserved', () => {
  const raw = '08-23 23:10:17.500  100  100 I MyTag: key: value: more';
  const line = parseLogLine(raw);
  assert.equal(line?.tag, 'MyTag');
  assert.equal(line?.message, 'key: value: more');
});
