// Круговые тесты: каждый formatXxx из demoFormatters.ts прогоняется через
// РЕАЛЬНЫЙ парсер (тот же, что использует настоящий AdbService на выводе
// настоящего adb) -- страховка, что синтетический текст демо-режима не
// разошёлся форматом с тем, что эти парсеры на самом деле ожидают.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatDevicesList,
  formatGetpropAll,
  formatPmListPackages,
  formatDumpsysPackageDetail,
  formatDumpsysPackageBulk,
  formatPmPath,
  formatLsLa,
  formatPs,
  formatCpuInfo,
  formatMemInfo,
  formatBattery,
  formatIpRoute,
  formatForwardList,
  formatReverseList,
  formatNetstatsDetail,
  formatUsageStats,
  formatCrashListing,
  apkDirFor,
} from '../main/adb/demo/demoFormatters';
import { DEMO_APPS, DEMO_SERIAL } from '../main/adb/demo/demoData';

import { parseDevices } from '../main/adb/parsers/DeviceParser';
import { parseGetprop } from '../main/adb/parsers/GetpropParser';
import { mergeApps } from '../main/adb/parsers/AppListParser';
import { parseAppDetail } from '../main/adb/parsers/DumpsysParser';
import { parseVersionCodes } from '../main/adb/parsers/VersionCodeParser';
import { parseApkPaths } from '../main/adb/parsers/ApkPathParser';
import { parseRemoteFiles } from '../main/adb/parsers/RemoteFileParser';
import { parseProcessList } from '../main/adb/parsers/ProcessListParser';
import { parseDeviceStats } from '../main/adb/parsers/DeviceStatsParser';
import { parseDeviceIP } from '../main/adb/parsers/IpRouteParser';
import { parseForwardList, parseReverseList } from '../main/adb/parsers/PortForwardParser';
import { parseNetworkUsage } from '../main/adb/parsers/NetworkUsageParser';
import { parseUsageStats } from '../main/adb/parsers/UsageStatsParser';
import { parseCrashTraceListing } from '../main/adb/parsers/CrashTraceParser';

const spotify = DEMO_APPS.find((a) => a.packageName === 'com.spotify.music')!;
const settingsApp = DEMO_APPS.find((a) => a.packageName === 'com.android.settings')!;

test('formatDevicesList -> parseDevices finds the demo device as ready', () => {
  const devices = parseDevices(formatDevicesList());
  assert.equal(devices.length, 1);
  assert.equal(devices[0].serial, DEMO_SERIAL);
  assert.equal(devices[0].state, 'device');
  assert.equal(devices[0].model, 'Pixel_8_Pro');
});

test('formatGetpropAll -> parseGetprop round-trips all keys', () => {
  const props = parseGetprop(formatGetpropAll({ 'ro.product.model': 'Pixel_8_Pro', 'ro.build.version.release': '15' }));
  const map = Object.fromEntries(props.map((p) => [p.key, p.value]));
  assert.equal(map['ro.product.model'], 'Pixel_8_Pro');
  assert.equal(map['ro.build.version.release'], '15');
});

test('formatPmListPackages -> mergeApps correctly splits system/user/disabled', () => {
  const all = formatPmListPackages(DEMO_APPS);
  const user = formatPmListPackages(DEMO_APPS.filter((a) => !a.isSystem));
  const disabled = formatPmListPackages(DEMO_APPS.filter((a) => a.disabledByDefault));
  const merged = mergeApps(all, user, disabled);

  assert.equal(merged.length, DEMO_APPS.length);
  const spotifyMerged = merged.find((a) => a.packageName === 'com.spotify.music')!;
  assert.equal(spotifyMerged.isSystem, false);
  const chromeMerged = merged.find((a) => a.packageName === 'com.android.chrome')!;
  assert.equal(chromeMerged.isSystem, true);
  const fbServices = merged.find((a) => a.packageName === 'com.facebook.services')!;
  assert.equal(fbServices.isEnabled, false);
});

test('formatDumpsysPackageDetail -> parseAppDetail extracts version, dates, uid and permissions', () => {
  const detail = parseAppDetail(spotify.packageName, formatDumpsysPackageDetail(spotify, true));
  assert.equal(detail.versionName, spotify.versionName);
  assert.equal(detail.versionCode, String(spotify.versionCode));
  assert.equal(detail.firstInstallTime, spotify.firstInstallTime);
  assert.equal(detail.lastUpdateTime, spotify.lastUpdateTime);
  assert.equal(detail.targetSdk, String(spotify.targetSdk));
  assert.equal(detail.uid, spotify.uid);
  assert.equal(detail.isEnabled, true);
  assert.equal(detail.apkPath, apkDirFor(spotify.packageName));

  const recordAudio = detail.permissions.find((p) => p.name === 'android.permission.RECORD_AUDIO');
  assert.ok(recordAudio, 'RECORD_AUDIO should be present');
  assert.equal(recordAudio!.granted, true);
  assert.equal(recordAudio!.isRuntime, true);

  const location = detail.permissions.find((p) => p.name === 'android.permission.ACCESS_FINE_LOCATION');
  assert.equal(location!.granted, false);

  const internet = detail.permissions.find((p) => p.name === 'android.permission.INTERNET');
  assert.equal(internet!.isRuntime, false);
  assert.equal(internet!.granted, true);
});

test('formatDumpsysPackageDetail with enabled=false is parsed as disabled', () => {
  const detail = parseAppDetail(spotify.packageName, formatDumpsysPackageDetail(spotify, false));
  assert.equal(detail.isEnabled, false);
});

test('formatDumpsysPackageDetail handles an app with no permissions at all (system app)', () => {
  const detail = parseAppDetail(settingsApp.packageName, formatDumpsysPackageDetail(settingsApp, true));
  assert.equal(detail.versionName, settingsApp.versionName);
  assert.deepEqual(detail.permissions, []);
});

test('formatDumpsysPackageBulk -> parseVersionCodes recovers every versionCode', () => {
  const codes = parseVersionCodes(formatDumpsysPackageBulk(DEMO_APPS));
  for (const app of DEMO_APPS) {
    assert.equal(codes[app.packageName], app.versionCode, app.packageName);
  }
});

test('formatPmPath -> parseApkPaths finds base.apk under the app-specific dir', () => {
  const paths = parseApkPaths(formatPmPath(spotify));
  assert.equal(paths.length, 1);
  assert.equal(paths[0], `${apkDirFor(spotify.packageName)}/base.apk`);
});

test('formatLsLa -> parseRemoteFiles recovers name/type/size, sorted dirs-first', () => {
  const files = parseRemoteFiles(
    formatLsLa([
      { name: 'Camera', isDirectory: true, sizeBytes: 4096, modified: '2025-09-01 10:22' },
      { name: 'notes.txt', isDirectory: false, sizeBytes: 842, modified: '2025-08-27 22:10' },
    ]),
    '/sdcard'
  );
  assert.equal(files.length, 2);
  assert.equal(files[0].name, 'Camera');
  assert.equal(files[0].isDirectory, true);
  assert.equal(files[0].path, '/sdcard/Camera');
  assert.equal(files[1].name, 'notes.txt');
  assert.equal(files[1].sizeBytes, 842);
});

test('formatPs -> parseProcessList skips the header row and parses PID/USER/RSS/NAME', () => {
  const processes = parseProcessList(formatPs([{ pid: 1234, ppid: 1, user: 'u0_a201', rssKB: 88452, name: 'com.spotify.music' }]));
  assert.equal(processes.length, 1);
  assert.equal(processes[0].pid, 1234);
  assert.equal(processes[0].user, 'u0_a201');
  assert.equal(processes[0].rssKB, 88452);
  assert.equal(processes[0].name, 'com.spotify.music');
});

test('formatCpuInfo/formatMemInfo/formatBattery -> parseDeviceStats recovers cpu/mem/battery', () => {
  const stats = parseDeviceStats(formatCpuInfo(23), formatMemInfo(8_144_408, 3_211_008), formatBattery(76, 285, true));
  assert.equal(stats.cpuPercent, 23);
  assert.equal(stats.memTotalKB, 8_144_408);
  assert.equal(stats.memUsedKB, 8_144_408 - 3_211_008);
  assert.equal(stats.batteryLevel, 76);
  assert.equal(stats.batteryTemperature, 28.5);
  assert.equal(stats.isCharging, true);
});

test('formatIpRoute -> parseDeviceIP recovers the wlan source address', () => {
  assert.equal(parseDeviceIP(formatIpRoute('192.168.1.42')), '192.168.1.42');
});

test('formatForwardList/formatReverseList -> parsers recover host/device specs in the right columns', () => {
  const forwards = parseForwardList(formatForwardList(DEMO_SERIAL, [{ hostSpec: 'tcp:8080', deviceSpec: 'tcp:8080' }]), DEMO_SERIAL);
  assert.equal(forwards.length, 1);
  assert.equal(forwards[0].hostSpec, 'tcp:8080');
  assert.equal(forwards[0].deviceSpec, 'tcp:8080');

  const reverses = parseReverseList(formatReverseList(DEMO_SERIAL, [{ hostSpec: 'tcp:3000', deviceSpec: 'tcp:3000' }]), DEMO_SERIAL);
  assert.equal(reverses.length, 1);
  assert.equal(reverses[0].hostSpec, 'tcp:3000');
  assert.equal(reverses[0].deviceSpec, 'tcp:3000');
});

test('formatNetstatsDetail -> parseNetworkUsage sums bytes for the matching uid only', () => {
  const output = formatNetstatsDetail([
    { uid: 10201, rxBytes: 1000, txBytes: 500 },
    { uid: 10202, rxBytes: 99999, txBytes: 88888 },
  ]);
  const usage = parseNetworkUsage(output, 10201);
  assert.equal(usage.rxBytes, 1000);
  assert.equal(usage.txBytes, 500);
});

test('formatUsageStats -> parseUsageStats recovers per-package duration', () => {
  const stats = parseUsageStats(formatUsageStats([{ packageName: 'com.spotify.music', totalTimeSeconds: 3661 }]));
  assert.equal(stats.length, 1);
  assert.equal(stats[0].packageName, 'com.spotify.music');
  assert.equal(stats[0].totalSeconds, 3661);
});

test('formatCrashListing -> parseCrashTraceListing recovers filenames', () => {
  const files = parseCrashTraceListing(formatCrashListing(['anr_2025-08-15-10-30-00.txt']), '/data/anr/', 'anr');
  assert.equal(files.length, 1);
  assert.equal(files[0].name, 'anr_2025-08-15-10-30-00.txt');
  assert.equal(files[0].kind, 'anr');
});
