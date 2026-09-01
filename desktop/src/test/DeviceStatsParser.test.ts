import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCpuPercent, parseMemInfo, parseBattery, parseDeviceStats } from '../main/adb/parsers/DeviceStatsParser';
import { memUsedPercent } from '../main/adb/types/DeviceStats';

test('parses CPU total from cpuinfo', () => {
  const output = [
    'Load: 3.5 / 3.2 / 2.9',
    'CPU usage from 10000ms to 5000ms ago:',
    '  9.9% 1234/system_server: 5% user + 4.8% kernel',
    '  45% TOTAL: 30% user + 15% kernel',
  ].join('\n');
  assert.equal(parseCpuPercent(output), 45);
});

test('CPU percent is clamped to 100', () => {
  assert.equal(parseCpuPercent('150% TOTAL: 100% user + 50% kernel'), 100);
});

test('CPU percent undefined when no TOTAL line', () => {
  assert.equal(parseCpuPercent('no useful data here'), undefined);
});

test('parses mem info using Available', () => {
  const output = ['MemTotal:        3699016 kB', 'MemFree:          123456 kB', 'MemAvailable:    1699016 kB'].join('\n');
  const mem = parseMemInfo(output);
  assert.equal(mem?.totalKB, 3699016);
  assert.equal(mem?.usedKB, 3699016 - 1699016);
});

test('parses mem info falls back to Free without Available', () => {
  const output = ['MemTotal:        1000000 kB', 'MemFree:           400000 kB'].join('\n');
  assert.equal(parseMemInfo(output)?.usedKB, 600000);
});

test('parses battery charging via status', () => {
  const output = [
    'Current Battery Service state:',
    '  AC powered: false',
    '  USB powered: false',
    '  status: 2',
    '  level: 85',
    '  scale: 100',
    '  temperature: 285',
  ].join('\n');
  const battery = parseBattery(output);
  assert.equal(battery.level, 85);
  assert.equal(battery.temperature, 28.5);
  assert.equal(battery.charging, true);
});

test('parses battery charging via USB powered', () => {
  const output = ['AC powered: false', 'USB powered: true', 'status: 3', 'level: 60', 'scale: 100'].join('\n');
  const battery = parseBattery(output);
  assert.equal(battery.charging, true);
  assert.equal(battery.level, 60);
});

test('battery level rescaled when scale is not 100', () => {
  const output = ['level: 5', 'scale: 10', 'status: 4'].join('\n');
  const battery = parseBattery(output);
  assert.equal(battery.level, 50);
  assert.equal(battery.charging, false);
});

test('combined parse produces memUsedPercent', () => {
  const stats = parseDeviceStats('20% TOTAL: 10% user + 10% kernel', 'MemTotal: 1000 kB\nMemAvailable: 500 kB', 'level: 42\nscale: 100\nstatus: 1');
  assert.equal(stats.cpuPercent, 20);
  assert.equal(memUsedPercent(stats), 50);
  assert.equal(stats.batteryLevel, 42);
  assert.equal(stats.isCharging, false);
});
