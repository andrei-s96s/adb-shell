import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFDroidResponse } from '../main/apkLibrary/FDroidUpdateChecker';
import { fdroidDownloadUrl } from '../main/adb/types/FDroidUpdateInfo';

// Реальный формат ответа https://f-droid.org/api/v1/packages/<pkg> —
// suggestedVersionCode приходит ЧИСЛОМ, не строкой (та же ловушка, что уже
// один раз поймали в Swift-версии).
const realSampleJson = JSON.stringify({
  packageName: 'org.fdroid.fdroid',
  suggestedVersionCode: 1023052,
  packages: [
    { versionName: '2.0-rc1', versionCode: 2000041 },
    { versionName: '1.23.2', versionCode: 1023052 },
  ],
});

test('parses real response shape and detects update', () => {
  const update = parseFDroidResponse(realSampleJson, 1_000_000);
  assert.equal(update?.packageName, 'org.fdroid.fdroid');
  // берём максимум по всем сборкам, а не только suggestedVersionCode
  assert.equal(update?.latestVersionCode, 2000041);
  assert.equal(update?.latestVersionName, '2.0-rc1');
});

test('up-to-date installed version produces no update', () => {
  assert.equal(parseFDroidResponse(realSampleJson, 2000041), undefined);
});

test('malformed JSON produces undefined', () => {
  assert.equal(parseFDroidResponse('not json', 1), undefined);
});

test('missing packages array still uses suggestedVersionCode', () => {
  const json = JSON.stringify({ packageName: 'com.example.app', suggestedVersionCode: 50, packages: null });
  const update = parseFDroidResponse(json, 10);
  assert.equal(update?.latestVersionCode, 50);
});

test('download URL follows F-Droid repo convention', () => {
  const url = fdroidDownloadUrl({ packageName: 'org.fdroid.fdroid', installedVersionCode: 1, latestVersionCode: 1023052, latestVersionName: '1.23.2' });
  assert.equal(url, 'https://f-droid.org/repo/org.fdroid.fdroid_1023052.apk');
});
