// Сквозные тесты DemoAdbService -- в отличие от demoFormatters.test.ts
// (проверяет только сырой текст через реальные парсеры), здесь дёргаются
// реальные унаследованные методы AdbService (listApps, appDetail,
// listDirectory, deviceStats и т.д.), которые сами вызывают
// this.run([...]) -- страховка от опечаток в распознавании команд внутри
// DemoAdbService.runShell/runRawAdb, которые formatters-тесты не поймают
// (те проверяют только формат текста, не то, что нужная ветка вообще
// вызывается на нужный набор args).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DemoAdbService } from '../main/adb/demo/DemoAdbService';
import { DEMO_APPS, DEMO_SERIAL, DEMO_IP } from '../main/adb/demo/demoData';

test('listDevices returns exactly the demo device, ready', async () => {
  const adb = new DemoAdbService();
  const devices = await adb.listDevices();
  assert.equal(devices.length, 1);
  assert.equal(devices[0].serial, DEMO_SERIAL);
  assert.equal(devices[0].state, 'device');
});

test('listApps returns every seeded app with correct system/enabled flags', async () => {
  const adb = new DemoAdbService();
  const apps = await adb.listApps(DEMO_SERIAL);
  assert.equal(apps.length, DEMO_APPS.length);
  const chrome = apps.find((a) => a.packageName === 'com.android.chrome')!;
  assert.equal(chrome.isSystem, true);
  const spotify = apps.find((a) => a.packageName === 'com.spotify.music')!;
  assert.equal(spotify.isSystem, false);
  const fbServices = apps.find((a) => a.packageName === 'com.facebook.services')!;
  assert.equal(fbServices.isEnabled, false);
});

test('appDetail returns rich, correct data for a seeded package', async () => {
  const adb = new DemoAdbService();
  const detail = await adb.appDetail(DEMO_SERIAL, 'com.spotify.music');
  assert.equal(detail.versionName, '8.9.98.583');
  assert.equal(detail.isEnabled, true);
  assert.ok(detail.permissions.length > 0);
});

test('uninstall removes the app from a subsequent listApps', async () => {
  const adb = new DemoAdbService();
  await adb.uninstall(DEMO_SERIAL, 'com.discord');
  const apps = await adb.listApps(DEMO_SERIAL);
  assert.ok(!apps.some((a) => a.packageName === 'com.discord'));
});

test('setEnabled(false) then setEnabled(true) round-trips isEnabled', async () => {
  const adb = new DemoAdbService();
  await adb.setEnabled(DEMO_SERIAL, 'com.termux', false);
  let apps = await adb.listApps(DEMO_SERIAL);
  assert.equal(apps.find((a) => a.packageName === 'com.termux')!.isEnabled, false);

  await adb.setEnabled(DEMO_SERIAL, 'com.termux', true);
  apps = await adb.listApps(DEMO_SERIAL);
  assert.equal(apps.find((a) => a.packageName === 'com.termux')!.isEnabled, true);
});

test('grantPermission/revokePermission flip a runtime permission in appDetail', async () => {
  const adb = new DemoAdbService();
  await adb.revokePermission(DEMO_SERIAL, 'com.whatsapp', 'android.permission.CAMERA');
  let detail = await adb.appDetail(DEMO_SERIAL, 'com.whatsapp');
  assert.equal(detail.permissions.find((p) => p.name === 'android.permission.CAMERA')!.granted, false);

  await adb.grantPermission(DEMO_SERIAL, 'com.whatsapp', 'android.permission.CAMERA');
  detail = await adb.appDetail(DEMO_SERIAL, 'com.whatsapp');
  assert.equal(detail.permissions.find((p) => p.name === 'android.permission.CAMERA')!.granted, true);
});

test('listDirectory returns the seeded /sdcard tree', async () => {
  const adb = new DemoAdbService();
  const files = await adb.listDirectory(DEMO_SERIAL, '/sdcard');
  assert.ok(files.some((f) => f.name === 'DCIM' && f.isDirectory));
  assert.ok(files.some((f) => f.name === 'notes.txt' && !f.isDirectory));
});

test('makeDirectory then listDirectory shows the new folder; removeRemote removes it', async () => {
  const adb = new DemoAdbService();
  await adb.makeDirectory(DEMO_SERIAL, '/sdcard/DemoFolder');
  let files = await adb.listDirectory(DEMO_SERIAL, '/sdcard');
  assert.ok(files.some((f) => f.name === 'DemoFolder' && f.isDirectory));

  await adb.removeRemote(DEMO_SERIAL, '/sdcard/DemoFolder', true);
  files = await adb.listDirectory(DEMO_SERIAL, '/sdcard');
  assert.ok(!files.some((f) => f.name === 'DemoFolder'));
});

test('pull actually writes a local placeholder file', async () => {
  const adb = new DemoAdbService();
  const localPath = path.join(os.tmpdir(), `adb-shell-demo-test-${Date.now()}.txt`);
  try {
    await adb.pull(DEMO_SERIAL, '/sdcard/notes.txt', localPath);
    assert.ok(fs.existsSync(localPath));
    assert.ok(fs.readFileSync(localPath, 'utf8').length > 0);
  } finally {
    fs.rmSync(localPath, { force: true });
  }
});

test('deviceStats returns sane, in-range values', async () => {
  const adb = new DemoAdbService();
  const stats = await adb.deviceStats(DEMO_SERIAL);
  assert.ok(stats.cpuPercent !== undefined && stats.cpuPercent >= 0 && stats.cpuPercent <= 100);
  assert.ok(stats.memTotalKB > 0);
  assert.ok(stats.memUsedKB >= 0 && stats.memUsedKB <= stats.memTotalKB);
  assert.ok(stats.batteryLevel !== undefined && stats.batteryLevel >= 0 && stats.batteryLevel <= 100);
});

test('port forwarding: add, list, remove round-trip', async () => {
  const adb = new DemoAdbService();
  assert.deepEqual(await adb.listForwards(DEMO_SERIAL), []);
  await adb.addForward(DEMO_SERIAL, 'tcp:8080', 'tcp:8080');
  let forwards = await adb.listForwards(DEMO_SERIAL);
  assert.equal(forwards.length, 1);
  assert.equal(forwards[0].hostSpec, 'tcp:8080');

  await adb.removeForward(DEMO_SERIAL, 'tcp:8080');
  forwards = await adb.listForwards(DEMO_SERIAL);
  assert.equal(forwards.length, 0);
});

test('enableWirelessDebugging and deviceIPAddress succeed with a plausible IP', async () => {
  const adb = new DemoAdbService();
  const result = await adb.enableWirelessDebugging(DEMO_SERIAL);
  assert.ok(result.length > 0);
  const ip = await adb.deviceIPAddress(DEMO_SERIAL);
  assert.equal(ip, DEMO_IP);
});

test('shell() answers common commands and gracefully labels unrecognized ones', async () => {
  const adb = new DemoAdbService();
  assert.match(await adb.shell(DEMO_SERIAL, 'id'), /uid=/);
  const unknown = await adb.shell(DEMO_SERIAL, 'some-totally-unknown-command --flag');
  assert.match(unknown, /демо-режим/);
});

test('runRaw handles root/remount without throwing', async () => {
  const adb = new DemoAdbService();
  assert.match(await adb.runRaw(DEMO_SERIAL, 'root'), /root/);
  assert.match(await adb.runRaw(DEMO_SERIAL, 'remount'), /remount/);
});

test('crashTraces returns the seeded fake ANR entry', async () => {
  const adb = new DemoAdbService();
  const traces = await adb.crashTraces(DEMO_SERIAL);
  assert.ok(traces.some((t) => t.kind === 'anr'));
});

test('securityInfo reports a plausible, non-rooted, locked profile', async () => {
  const adb = new DemoAdbService();
  const info = await adb.securityInfo(DEMO_SERIAL);
  assert.equal(info.suBinaryPresent, false);
  assert.equal(info.isSecure, true);
  assert.equal(info.bootloaderLocked, true);
});

test('screenshot returns a non-empty valid PNG buffer', async () => {
  const adb = new DemoAdbService();
  const png = await adb.screenshot(DEMO_SERIAL);
  assert.ok(png.length > 100);
  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  assert.deepEqual(png.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
});
