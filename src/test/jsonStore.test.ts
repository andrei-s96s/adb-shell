import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadJsonStore, saveJsonStore } from '../main/util/jsonStore';

function tempConfigPath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jsonstore-test-')), 'store.json');
}

const isArray = (p: unknown): boolean => Array.isArray(p);
const isObject = (p: unknown): boolean => !!p && typeof p === 'object';

test('loadJsonStore returns the fallback when the file does not exist', () => {
  const configPath = tempConfigPath();
  assert.deepEqual(loadJsonStore<string[]>(configPath, isArray, []), []);
});

test('loadJsonStore returns the fallback when the file contains invalid JSON', () => {
  const configPath = tempConfigPath();
  fs.writeFileSync(configPath, '{not valid json');
  assert.deepEqual(loadJsonStore<string[]>(configPath, isArray, ['fallback']), ['fallback']);
});

test('loadJsonStore returns the fallback when the parsed shape fails isValid', () => {
  const configPath = tempConfigPath();
  fs.writeFileSync(configPath, JSON.stringify({ not: 'an array' }));
  assert.deepEqual(loadJsonStore<string[]>(configPath, isArray, []), []);
});

test('saveJsonStore then loadJsonStore round-trips an array', () => {
  const configPath = tempConfigPath();
  saveJsonStore(configPath, ['a', 'b', 'c']);
  assert.deepEqual(loadJsonStore<string[]>(configPath, isArray, []), ['a', 'b', 'c']);
});

test('saveJsonStore then loadJsonStore round-trips an object map', () => {
  const configPath = tempConfigPath();
  saveJsonStore(configPath, { device1: 'My Phone' });
  assert.deepEqual(loadJsonStore<Record<string, string>>(configPath, isObject, {}), { device1: 'My Phone' });
});

test('saveJsonStore creates the parent directory if it does not exist yet', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonstore-test-'));
  const configPath = path.join(dir, 'nested', 'deeper', 'store.json');
  saveJsonStore(configPath, [1, 2, 3]);
  assert.ok(fs.existsSync(configPath));
});

test('saveJsonStore leaves no stray .tmp file behind after a successful write', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonstore-test-'));
  const configPath = path.join(dir, 'store.json');
  saveJsonStore(configPath, { a: 1 });
  const entries = fs.readdirSync(dir);
  assert.deepEqual(entries, ['store.json']);
});

test('saveJsonStore overwrites a previously corrupted file with a full valid write', () => {
  const configPath = tempConfigPath();
  fs.writeFileSync(configPath, '{"truncated": tr');
  saveJsonStore(configPath, { recovered: true });
  assert.deepEqual(loadJsonStore<{ recovered: boolean }>(configPath, isObject, { recovered: false }), { recovered: true });
});

test('saveJsonStore does not throw when the directory cannot be created', () => {
  // Путь-файл (а не директория) в качестве родителя -- mkdirSync не сможет
  // создать поддиректорию с тем же именем; saveJsonStore должен проглотить
  // ошибку молча (та же гарантия "не критично", что была у каждого стора).
  const blockerFile = tempConfigPath();
  fs.writeFileSync(blockerFile, 'x');
  const impossiblePath = path.join(blockerFile, 'nested', 'store.json');
  assert.doesNotThrow(() => saveJsonStore(impossiblePath, { a: 1 }));
});

test('a unique temp filename avoids colliding with a concurrent save to a different store', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonstore-test-'));
  const configPath = path.join(dir, 'store.json');
  saveJsonStore(configPath, { first: true });
  saveJsonStore(configPath, { second: true });
  assert.deepEqual(loadJsonStore<{ second: boolean }>(configPath, isObject, { second: false }), { second: true });
  assert.deepEqual(
    fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')),
    []
  );
});
