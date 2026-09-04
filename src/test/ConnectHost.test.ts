import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConnectHost } from '../main/adb/parsers/ConnectHost';

test('host without colon gets default port 5555', () => {
  assert.equal(normalizeConnectHost('192.168.1.50'), '192.168.1.50:5555');
});

test('host with colon is left untouched', () => {
  assert.equal(normalizeConnectHost('192.168.1.50:5556'), '192.168.1.50:5556');
});
