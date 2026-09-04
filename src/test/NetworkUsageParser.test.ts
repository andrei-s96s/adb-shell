import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNetworkUsage } from '../main/adb/parsers/NetworkUsageParser';

// Тестовые кейсы зеркалят Tests/AdbShellTests/NetworkUsageParserTests.swift.

test('sums bytes within target uid block', () => {
  const output = [
    'ident=[{...uid=10001, set=DEFAULT, tag=0x0}]',
    '  NetworkStatsHistory: bucketDuration=3600000',
    '  st=1 rb=1000 rp=5 tb=2000 tp=3 op=0',
    '  st=2 rb=1500 rp=6 tb=2500 tp=4 op=0',
    'ident=[{...uid=10002, set=DEFAULT, tag=0x0}]',
    '  st=3 rb=999999 tb=999999',
  ].join('\n');
  const usage = parseNetworkUsage(output, 10001);
  assert.equal(usage.rxBytes, 2500);
  assert.equal(usage.txBytes, 4500);
});

test('supports long field names', () => {
  const output = ['uid=555', 'rxBytes=100 txBytes=200', 'rxBytes=50 txBytes=25'].join('\n');
  const usage = parseNetworkUsage(output, 555);
  assert.equal(usage.rxBytes, 150);
  assert.equal(usage.txBytes, 225);
});

test('zero when uid not present', () => {
  const usage = parseNetworkUsage('uid=1 rb=10 tb=10', 999);
  assert.equal(usage.rxBytes, 0);
  assert.equal(usage.txBytes, 0);
});
