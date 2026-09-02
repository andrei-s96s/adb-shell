import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseApkBadging } from '../main/adb/parsers/ApkBadgingParser';

test('parses typical badging output', () => {
  const output = [
    "package: name='com.example.app' versionCode='42' versionName='1.2.3' compileSdkVersion='34'",
    "sdkVersion:'21'",
    "targetSdkVersion:'33'",
    "uses-permission: name='android.permission.INTERNET'",
    "uses-permission: name='android.permission.CAMERA'",
    "application-label:'Example App'",
    "application-icon-160:'res/mipmap-mdpi-v4/ic_launcher.png'",
    "launchable-activity: name='com.example.app.MainActivity'  label='' icon=''",
  ].join('\n');

  const info = parseApkBadging(output);

  assert.equal(info.packageName, 'com.example.app');
  assert.equal(info.versionCode, '42');
  assert.equal(info.versionName, '1.2.3');
  assert.equal(info.minSdk, '21');
  assert.equal(info.targetSdk, '33');
  assert.equal(info.applicationLabel, 'Example App');
  assert.deepEqual(info.permissions, ['android.permission.INTERNET', 'android.permission.CAMERA']);
});

test('missing fields stay undefined', () => {
  const info = parseApkBadging('garbage output');
  assert.equal(info.packageName, undefined);
  assert.equal(info.permissions.length, 0);
});
