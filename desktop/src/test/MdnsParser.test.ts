import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMdnsServices } from '../main/adb/parsers/MdnsParser';
import { mdnsNeedsPairing } from '../main/adb/types/MdnsDevice';

// Тестовые кейсы зеркалят Tests/AdbShellTests/MdnsParserTests.swift.

test('parses connect and pairing services', () => {
  const output = [
    'List of discovered mdns services',
    'adb-1234ABCD-connect\t_adb-tls-connect._tcp.\t192.168.1.50:41231',
    'adb-1234ABCD-pairing\t_adb-tls-pairing._tcp.\t192.168.1.50:37251',
  ].join('\n');

  const devices = parseMdnsServices(output);
  assert.equal(devices.length, 2);
  assert.equal(devices[0].address, '192.168.1.50:41231');
  assert.equal(mdnsNeedsPairing(devices[0]), false);
  assert.equal(mdnsNeedsPairing(devices[1]), true);
});

test('empty list produces no devices', () => {
  assert.deepEqual(parseMdnsServices('List of discovered mdns services\n'), []);
});

test('malformed lines are skipped', () => {
  const output = ['List of discovered mdns services', 'garbage line with no tabs', 'name\tonly-two-fields'].join(
    '\n'
  );
  assert.deepEqual(parseMdnsServices(output), []);
});
