import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseApkPaths, primaryApkPath } from '../main/adb/parsers/ApkPathParser';

test('parses package: prefixed lines', () => {
  const paths = parseApkPaths('package:/data/app/~~x/com.example-1/base.apk\n');
  assert.deepEqual(paths, ['/data/app/~~x/com.example-1/base.apk']);
});

test('parses multiple split-apk paths', () => {
  const out = ['package:/data/app/~~x/com.example-1/base.apk', 'package:/data/app/~~x/com.example-1/split_config.arm64_v8a.apk'].join(
    '\n'
  );
  assert.equal(parseApkPaths(out).length, 2);
});

test('primaryApkPath prefers base.apk among split apks', () => {
  const paths = ['/x/split_config.arm64_v8a.apk', '/x/base.apk'];
  assert.equal(primaryApkPath(paths), '/x/base.apk');
});

test('primaryApkPath falls back to first path when no base.apk present', () => {
  assert.equal(primaryApkPath(['/x/only.apk']), '/x/only.apk');
});

test('primaryApkPath is undefined for an empty list', () => {
  assert.equal(primaryApkPath([]), undefined);
});
