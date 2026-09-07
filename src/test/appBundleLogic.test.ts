import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grantedRuntimePermissionNames, diffManifests, isMeaningfulDiff } from '../main/appBundles/appBundleLogic';
import { AppBundleManifest } from '../main/adb/types/AppBundleManifest';

test('keeps only granted runtime permissions', () => {
  const names = grantedRuntimePermissionNames([
    { name: 'android.permission.CAMERA', isRuntime: true, granted: true },
    { name: 'android.permission.CONTACTS', isRuntime: true, granted: false },
    { name: 'android.permission.INTERNET', isRuntime: false, granted: true },
  ]);
  assert.deepEqual(names, ['android.permission.CAMERA']);
});

test('empty permission list produces empty result', () => {
  assert.deepEqual(grantedRuntimePermissionNames([]), []);
});

function manifest(entries: AppBundleManifest['entries']): AppBundleManifest {
  return { exportedAt: '2026-01-01T00:00:00.000Z', entries };
}

test('diffManifests marks a package present only in b as added', () => {
  const a = manifest([]);
  const b = manifest([{ packageName: 'com.example.app', apkFileName: 'a.apk', versionName: '1.0', permissions: ['android.permission.CAMERA'] }]);
  const [entry] = diffManifests(a, b);
  assert.equal(entry.packageName, 'com.example.app');
  assert.equal(entry.inA, false);
  assert.equal(entry.inB, true);
  assert.deepEqual(entry.addedPermissions, ['android.permission.CAMERA']);
  assert.deepEqual(entry.removedPermissions, []);
});

test('diffManifests marks a package present only in a as removed', () => {
  const a = manifest([{ packageName: 'com.example.app', apkFileName: 'a.apk', versionName: '1.0', permissions: [] }]);
  const b = manifest([]);
  const [entry] = diffManifests(a, b);
  assert.equal(entry.inA, true);
  assert.equal(entry.inB, false);
});

test('diffManifests detects version and permission changes for a package present in both', () => {
  const a = manifest([
    { packageName: 'com.example.app', apkFileName: 'a.apk', versionName: '1.0', permissions: ['android.permission.CAMERA', 'android.permission.CONTACTS'] },
  ]);
  const b = manifest([
    { packageName: 'com.example.app', apkFileName: 'a.apk', versionName: '2.0', permissions: ['android.permission.CAMERA', 'android.permission.LOCATION'] },
  ]);
  const [entry] = diffManifests(a, b);
  assert.equal(entry.versionA, '1.0');
  assert.equal(entry.versionB, '2.0');
  assert.deepEqual(entry.addedPermissions, ['android.permission.LOCATION']);
  assert.deepEqual(entry.removedPermissions, ['android.permission.CONTACTS']);
});

test('diffManifests result is sorted by packageName regardless of entries order', () => {
  const a = manifest([
    { packageName: 'zzz.last', apkFileName: 'z.apk', permissions: [] },
    { packageName: 'aaa.first', apkFileName: 'a.apk', permissions: [] },
  ]);
  const entries = diffManifests(a, a);
  assert.deepEqual(entries.map((e) => e.packageName), ['aaa.first', 'zzz.last']);
});

test('isMeaningfulDiff is false for an identical package in both manifests', () => {
  const a = manifest([{ packageName: 'com.example.app', apkFileName: 'a.apk', versionName: '1.0', permissions: ['android.permission.CAMERA'] }]);
  const [entry] = diffManifests(a, a);
  assert.equal(isMeaningfulDiff(entry), false);
});

test('isMeaningfulDiff is true for added, removed, and changed packages', () => {
  const a = manifest([
    { packageName: 'removed.only.in.a', apkFileName: 'y.apk', permissions: [] },
    { packageName: 'changed', apkFileName: 'z.apk', versionName: '1.0', permissions: [] },
  ]);
  const b = manifest([
    { packageName: 'changed', apkFileName: 'z.apk', versionName: '2.0', permissions: [] },
    { packageName: 'added.only.in.b', apkFileName: 'x.apk', permissions: [] },
  ]);
  const diff = diffManifests(a, b);
  const byName = new Map(diff.map((e) => [e.packageName, e]));
  assert.equal(isMeaningfulDiff(byName.get('added.only.in.b')!), true);
  assert.equal(isMeaningfulDiff(byName.get('removed.only.in.a')!), true);
  assert.equal(isMeaningfulDiff(byName.get('changed')!), true);
});
