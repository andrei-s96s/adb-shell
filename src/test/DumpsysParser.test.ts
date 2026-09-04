import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAppDetail } from '../main/adb/parsers/DumpsysParser';
import { permissionShortName } from '../main/adb/types/AppInfo';

// Тестовые кейсы зеркалят Tests/AdbShellTests/DumpsysParserTests.swift.

test('parses version and SDK info', () => {
  const output = [
    'Packages:',
    '  Package [com.example.app] (abcdef):',
    '    userId=10123',
    '    codePath=/data/app/~~xyz==/com.example.app-abc==',
    '    versionCode=42 minSdk=21 targetSdk=33',
    '    versionName=1.2.3',
    '    firstInstallTime=2024-01-10 10:00:00',
    '    lastUpdateTime=2024-05-01 12:33:04',
  ].join('\n');

  const detail = parseAppDetail('com.example.app', output);

  assert.equal(detail.versionName, '1.2.3');
  assert.equal(detail.versionCode, '42');
  assert.equal(detail.targetSdk, '33');
  assert.equal(detail.apkPath, '/data/app/~~xyz==/com.example.app-abc==');
  assert.equal(detail.firstInstallTime, '2024-01-10 10:00:00');
  assert.equal(detail.lastUpdateTime, '2024-05-01 12:33:04');
  assert.equal(detail.uid, 10123);
  assert.equal(detail.isEnabled, true);
});

test('enabled=false when component disabled', () => {
  const output = ['Package [com.example.app] (abcdef):', '  enabled=false'].join('\n');
  assert.equal(parseAppDetail('com.example.app', output).isEnabled, false);
});

test('enabled=false for disabled user state', () => {
  const output = [
    'Package [com.example.app] (abcdef):',
    '  enabled=COMPONENT_ENABLED_STATE_DISABLED_USER',
  ].join('\n');
  assert.equal(parseAppDetail('com.example.app', output).isEnabled, false);
});

test('runtime vs install permissions are distinguished', () => {
  const output = [
    'Package [com.example.app] (abcdef):',
    '  requested permissions:',
    '    android.permission.INTERNET',
    '    android.permission.CAMERA',
    '    android.permission.ACCESS_FINE_LOCATION',
    '  install permissions:',
    '    android.permission.INTERNET: granted=true',
    '  User 0:',
    '    runtime permissions:',
    '      android.permission.CAMERA: granted=true, flags=[ USER_SENSITIVE_WHEN_GRANTED]',
    '      android.permission.ACCESS_FINE_LOCATION: granted=false, flags=[ USER_SENSITIVE_WHEN_GRANTED]',
  ].join('\n');

  const detail = parseAppDetail('com.example.app', output);
  const byName = new Map(detail.permissions.map((p) => [p.name, p]));

  assert.equal(detail.permissions.length, 3);

  const internet = byName.get('android.permission.INTERNET');
  assert.equal(internet?.isRuntime, false);
  assert.equal(internet?.granted, true);

  const camera = byName.get('android.permission.CAMERA');
  assert.equal(camera?.isRuntime, true);
  assert.equal(camera?.granted, true);

  const location = byName.get('android.permission.ACCESS_FINE_LOCATION');
  assert.equal(location?.isRuntime, true);
  assert.equal(location?.granted, false);
});

test('requested-only permission defaults to granted, non-runtime', () => {
  const output = [
    'Package [com.example.app] (abcdef):',
    '  requested permissions:',
    '    android.permission.VIBRATE',
  ].join('\n');
  const detail = parseAppDetail('com.example.app', output);
  assert.equal(detail.permissions.length, 1);
  assert.equal(detail.permissions[0].granted, true);
  assert.equal(detail.permissions[0].isRuntime, false);
});

test('shortName strips package prefix', () => {
  assert.equal(
    permissionShortName({ name: 'android.permission.CAMERA', granted: true, isRuntime: true }),
    'CAMERA'
  );
});

test('empty output produces no permissions', () => {
  const detail = parseAppDetail('com.example.app', '');
  assert.deepEqual(detail.permissions, []);
  assert.equal(detail.versionName, undefined);
});
