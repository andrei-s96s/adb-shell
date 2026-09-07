import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSnapshotFilename, parseSnapshotFilename, sanitizeDeviceLabel, snapshotsToPruneAfterTaking } from '../main/deviceSnapshots/deviceSnapshotLogic';

// Тестовые кейсы зеркалят Tests/AdbShellTests/DeviceSnapshotTests.swift.

test('filename round-trips label and app count', () => {
  const filename = makeSnapshotFilename('Pixel 7 Pro', 42, 'abcd1234');
  const parsed = parseSnapshotFilename(filename);
  assert.equal(parsed?.label, 'Pixel 7 Pro');
  assert.equal(parsed?.appCount, 42);
});

test('sanitizes punctuation and unicode in device label', () => {
  // Никнеймы и модели устройств могут содержать слэши, двоеточия, кириллицу
  // и т.п. — имя файла должно остаться плоским компонентом пути и всё равно
  // распарситься обратно.
  const filename = makeSnapshotFilename('Мой Voyah / SSH-туннель:9222', 5, 'abcd1234');
  assert.ok(!filename.includes('/'));
  assert.ok(!filename.includes(':'));
  const parsed = parseSnapshotFilename(filename);
  assert.equal(parsed?.appCount, 5);
});

test('unrelated zip file does not parse as a snapshot', () => {
  assert.equal(parseSnapshotFilename('apps-export-2026-01-01-000000.zip'), undefined);
});

test('two snapshots of the same device get distinct filenames given distinct suffixes', () => {
  const first = makeSnapshotFilename('Pixel 7 Pro', 42, 'aaaaaaaa');
  const second = makeSnapshotFilename('Pixel 7 Pro', 42, 'bbbbbbbb');
  assert.notEqual(first, second);
});

test('sanitize collapses repeated separators and trims edges', () => {
  assert.equal(sanitizeDeviceLabel('  --Weird///Name--  '), 'Weird-Name');
});

test('sanitize of an all-punctuation label falls back to "device"', () => {
  assert.equal(sanitizeDeviceLabel('///:::'), 'device');
});

function snap(deviceLabel: string, path: string): { deviceLabel: string; path: string } {
  return { deviceLabel, path };
}

test('snapshotsToPruneAfterTaking keeps the newest `keep` and prunes the rest for that device', () => {
  const all = [snap('Pixel 7', 'p1'), snap('Pixel 7', 'p2'), snap('Pixel 7', 'p3')];
  assert.deepEqual(snapshotsToPruneAfterTaking(all, 'Pixel 7', 2), [snap('Pixel 7', 'p3')]);
});

test('snapshotsToPruneAfterTaking prunes nothing when under the limit', () => {
  const all = [snap('Pixel 7', 'p1'), snap('Pixel 7', 'p2')];
  assert.deepEqual(snapshotsToPruneAfterTaking(all, 'Pixel 7', 5), []);
});

test('snapshotsToPruneAfterTaking never touches snapshots of a different device', () => {
  const all = [snap('Pixel 7', 'p1'), snap('Pixel 7', 'p2'), snap('Pixel 7', 'p3'), snap('Galaxy S24', 'g1'), snap('Galaxy S24', 'g2')];
  assert.deepEqual(snapshotsToPruneAfterTaking(all, 'Pixel 7', 1), [snap('Pixel 7', 'p2'), snap('Pixel 7', 'p3')]);
});

test('snapshotsToPruneAfterTaking groups by the same sanitized label as filenames use, not exact string equality', () => {
  // "Мой Voyah" и его уже sanitize+desanitize-round-tripped вид "Мой-Voyah"
  // -> "Мой Voyah" (см. parseSnapshotFilename) должны схлопнуться в одну группу.
  const all = [snap('Мой Voyah', 'v1'), snap('Мой  Voyah', 'v2'), snap('Мой Voyah', 'v3')];
  assert.deepEqual(snapshotsToPruneAfterTaking(all, 'Мой Voyah', 1), [snap('Мой  Voyah', 'v2'), snap('Мой Voyah', 'v3')]);
});

test('snapshotsToPruneAfterTaking with keep=0 prunes every snapshot of that device', () => {
  const all = [snap('Pixel 7', 'p1'), snap('Pixel 7', 'p2')];
  assert.deepEqual(snapshotsToPruneAfterTaking(all, 'Pixel 7', 0), [snap('Pixel 7', 'p1'), snap('Pixel 7', 'p2')]);
});
