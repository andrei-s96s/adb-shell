import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeviceIP } from '../main/adb/parsers/IpRouteParser';

test('parses wlan src address', () => {
  const output = '192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.1.42';
  assert.equal(parseDeviceIP(output), '192.168.1.42');
});

test('prefers wlan over other interfaces when multiple lines', () => {
  const output = [
    '10.0.0.0/24 dev rndis0 proto kernel scope link src 10.0.0.5',
    '192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.1.42',
  ].join('\n');
  assert.equal(parseDeviceIP(output), '192.168.1.42');
});

test('falls back to any interface with src when no wlan', () => {
  const output = '10.0.0.0/24 dev rndis0 proto kernel scope link src 10.0.0.5';
  assert.equal(parseDeviceIP(output), '10.0.0.5');
});

test('returns undefined when no src present', () => {
  assert.equal(parseDeviceIP('default via 192.168.1.1 dev wlan0'), undefined);
});

test('returns undefined for empty output', () => {
  assert.equal(parseDeviceIP(''), undefined);
});
