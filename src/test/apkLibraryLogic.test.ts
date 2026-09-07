import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOutdatedDuplicates, InspectedApkFile } from '../main/apkLibrary/apkLibraryLogic';

function file(path: string, packageName: string, versionCode: number): InspectedApkFile {
  return { path, name: path, packageName, versionCode };
}

test('a file with a unique packageName in the library is never flagged', () => {
  const files = [file('a.apk', 'com.example.a', 1), file('b.apk', 'com.example.b', 1)];
  assert.deepEqual(findOutdatedDuplicates(files), {});
});

test('flags the lower-versionCode file of a duplicate pair, not the newer one', () => {
  const files = [file('old.apk', 'com.example.app', 1), file('new.apk', 'com.example.app', 2)];
  const result = findOutdatedDuplicates(files);
  assert.deepEqual(Object.keys(result), ['old.apk']);
  assert.deepEqual(result['old.apk'], { packageName: 'com.example.app', latestVersionCode: 2, latestFileName: 'new.apk' });
});

test('flags every older file when three or more copies of the same package exist', () => {
  const files = [file('v1.apk', 'com.example.app', 1), file('v3.apk', 'com.example.app', 3), file('v2.apk', 'com.example.app', 2)];
  const result = findOutdatedDuplicates(files);
  assert.deepEqual(Object.keys(result).sort(), ['v1.apk', 'v2.apk']);
  assert.equal(result['v1.apk'].latestVersionCode, 3);
  assert.equal(result['v2.apk'].latestVersionCode, 3);
});

test('two files sharing the same max versionCode are not flagged as outdated', () => {
  const files = [file('a.apk', 'com.example.app', 5), file('b.apk', 'com.example.app', 5)];
  assert.deepEqual(findOutdatedDuplicates(files), {});
});

test('different packages are grouped independently', () => {
  const files = [
    file('a-old.apk', 'com.example.a', 1),
    file('a-new.apk', 'com.example.a', 2),
    file('b-only.apk', 'com.example.b', 1),
  ];
  const result = findOutdatedDuplicates(files);
  assert.deepEqual(Object.keys(result), ['a-old.apk']);
});

test('an empty library produces no results', () => {
  assert.deepEqual(findOutdatedDuplicates([]), {});
});
