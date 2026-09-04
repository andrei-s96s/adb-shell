import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUsageStats, parseDurationToSeconds } from '../main/adb/parsers/UsageStatsParser';

// Тестовые кейсы зеркалят Tests/AdbShellTests/UsageStatsParserTests.swift.

test('parses duration string format', () => {
  const output = [
    'package: com.example.app',
    '  totalTimeUsed=+58m47s566ms',
    '  lastTimeUsed=12345',
    'package: com.other.app',
    '  totalTimeVisible=1h5m3s',
  ].join('\n');
  const stats = parseUsageStats(output);
  assert.equal(stats.length, 2);
  assert.equal(stats[0].packageName, 'com.example.app');
  assert.equal(stats[0].totalSeconds, 58 * 60 + 47);
  assert.equal(stats[1].packageName, 'com.other.app');
  assert.equal(stats[1].totalSeconds, 3600 + 5 * 60 + 3);
});

test('parses millisecond number format', () => {
  const stats = parseUsageStats('package=com.x totalTime=123456');
  assert.equal(stats.length, 1);
  assert.equal(stats[0].totalSeconds, 123);
});

test('skips zero-duration entries', () => {
  const output = ['package: com.idle.app', '  totalTimeUsed=0s'].join('\n');
  assert.deepEqual(parseUsageStats(output), []);
});

test('garbage input produces empty list', () => {
  assert.deepEqual(parseUsageStats('no useful data'), []);
});

test('duration component parsing handles milliseconds-only as undefined', () => {
  // "ms" не матчится ни как минуты (m без s после), ни как секунды (s не
  // сразу после цифр) — значит компонентов нет, результат undefined, а не 0
  // (0 означало бы "распарсили и получили ноль секунд").
  assert.equal(parseDurationToSeconds('566ms'), undefined);
});
