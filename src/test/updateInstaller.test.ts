import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSha256Text, UpdateInstallError } from '../main/updateInstaller';

const DIGEST = 'a'.repeat(64);

test('parseSha256Text accepts a bare hex digest', () => {
  assert.equal(parseSha256Text(DIGEST), DIGEST);
});

test('parseSha256Text accepts the traditional sha256sum "<hex>  <filename>" format', () => {
  assert.equal(parseSha256Text(`${DIGEST}  ADB Shell Setup 1.5.0.exe\n`), DIGEST);
});

test('parseSha256Text lowercases an uppercase digest', () => {
  assert.equal(parseSha256Text(DIGEST.toUpperCase()), DIGEST);
});

test('parseSha256Text trims surrounding whitespace/newlines', () => {
  assert.equal(parseSha256Text(`\n  ${DIGEST}  \n`), DIGEST);
});

test('parseSha256Text rejects text that is not a 64-hex-char digest', () => {
  assert.throws(() => parseSha256Text('not-a-digest'), UpdateInstallError);
});

test('parseSha256Text rejects an empty file', () => {
  assert.throws(() => parseSha256Text(''), UpdateInstallError);
});

test('parseSha256Text rejects a digest of the wrong length', () => {
  assert.throws(() => parseSha256Text('a'.repeat(63)), UpdateInstallError);
});
