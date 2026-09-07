import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { isPathWithinDirectory, assertPathWithinDirectory } from '../main/util/pathSafety';

const dir = path.join('home', 'user', 'Library', 'AdbShell', 'Snapshots');

test('a plain file directly inside the directory is within it', () => {
  assert.equal(isPathWithinDirectory(path.join(dir, 'snap.zip'), dir), true);
});

test('a file inside a nested subdirectory is within it', () => {
  assert.equal(isPathWithinDirectory(path.join(dir, 'sub', 'snap.zip'), dir), true);
});

test('the directory itself counts as within it', () => {
  assert.equal(isPathWithinDirectory(dir, dir), true);
});

test('a path escaping via ../.. is not within it', () => {
  assert.equal(isPathWithinDirectory(path.join(dir, '..', '..', 'secrets.txt'), dir), false);
});

test('an unrelated absolute path is not within it', () => {
  assert.equal(isPathWithinDirectory(path.join('home', 'user', '.ssh', 'id_rsa'), dir), false);
});

test('a sibling directory that merely shares the same string prefix is not within it', () => {
  const sibling = dir + '-evil';
  assert.equal(isPathWithinDirectory(path.join(sibling, 'x.zip'), dir), false);
});

test('assertPathWithinDirectory does not throw for a path inside the directory', () => {
  assert.doesNotThrow(() => assertPathWithinDirectory(path.join(dir, 'snap.zip'), dir));
});

test('assertPathWithinDirectory throws for a path outside the directory', () => {
  assert.throws(() => assertPathWithinDirectory(path.join(dir, '..', '..', 'secrets.txt'), dir));
});
