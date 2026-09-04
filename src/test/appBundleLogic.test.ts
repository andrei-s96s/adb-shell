import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grantedRuntimePermissionNames } from '../main/appBundles/appBundleLogic';

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
