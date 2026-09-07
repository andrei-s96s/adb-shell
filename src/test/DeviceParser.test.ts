import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDevices } from '../main/adb/parsers/DeviceParser';

// Тестовые кейсы зеркалят Tests/AdbShellTests/ADBServiceParsingTests.swift —
// та же спецификация поведения, тот же набор входных данных.

test('parses USB and network devices with -l output', () => {
  const output = [
    'List of devices attached',
    'R58N30ABCDE            device usb:1-1 product:voyah_car model:Voyah_HU device:hu transport_id:1',
    '192.168.1.50:5555      device product:generic model:Generic_x86 device:generic transport_id:2',
    'emulator-5554          offline transport_id:3',
    '',
  ].join('\n');

  const devices = parseDevices(output);
  assert.equal(devices.length, 3);

  assert.equal(devices[0].serial, 'R58N30ABCDE');
  assert.equal(devices[0].state, 'device');
  assert.equal(devices[0].model, 'Voyah_HU');

  assert.equal(devices[1].serial, '192.168.1.50:5555');
  assert.equal(devices[1].model, 'Generic_x86');

  assert.equal(devices[2].state, 'offline');
  assert.equal(devices[2].model, undefined);
});

test('parses unauthorized state', () => {
  const output = [
    'List of devices attached',
    'R58N30ABCDE            unauthorized usb:1-1 transport_id:1',
  ].join('\n');

  const devices = parseDevices(output);
  assert.equal(devices[0]?.state, 'unauthorized');
});

test('parses the two-word "no permissions" state (typically missing udev rules on Linux)', () => {
  const output = [
    'List of devices attached',
    '0123456789ABCDEF       no permissions (missing udev rules? user is in the plugdev group; are your udev rules wrong?); see [http://developer.android.com/tools/device.html]',
  ].join('\n');

  const devices = parseDevices(output);
  assert.equal(devices.length, 1);
  assert.equal(devices[0].serial, '0123456789ABCDEF');
  assert.equal(devices[0].state, 'noPermissions');
  assert.equal(devices[0].model, undefined);
});

test('empty device list produces empty array', () => {
  assert.deepEqual(parseDevices('List of devices attached\n'), []);
});
