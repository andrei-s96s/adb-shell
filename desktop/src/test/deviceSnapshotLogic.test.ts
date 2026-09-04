import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSnapshotFilename, parseSnapshotFilename, sanitizeDeviceLabel } from '../main/deviceSnapshots/deviceSnapshotLogic';

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
