import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSecurity } from '../main/adb/parsers/DeviceSecurityAnalyzer';
import { DeviceSecurityInfo } from '../main/adb/types/DeviceSecurityInfo';

// Тестовые кейсы зеркалят Tests/AdbShellTests/DeviceSecurityAnalyzerTests.swift.

test('clean device has only ok findings', () => {
  const info: DeviceSecurityInfo = {
    verifiedBootState: 'green',
    bootloaderLocked: true,
    isDebuggable: false,
    isSecure: true,
    suBinaryPresent: false,
    playProtectConsent: '1',
  };
  const findings = analyzeSecurity(info);
  assert.ok(findings.every((f) => f.level === 'ok'));
  assert.ok(findings.some((f) => f.messageKey === 'security.verifiedBoot.green'));
  assert.ok(findings.some((f) => f.messageKey === 'security.bootloader.locked'));
});

test('rooted unlocked device flags critical', () => {
  const info: DeviceSecurityInfo = {
    verifiedBootState: 'orange',
    bootloaderLocked: false,
    isDebuggable: true,
    isSecure: true,
    suBinaryPresent: true,
    playProtectConsent: '-1',
  };
  const findings = analyzeSecurity(info);
  assert.ok(findings.some((f) => f.messageKey === 'security.su.present' && f.level === 'critical'));
  assert.ok(findings.some((f) => f.messageKey === 'security.bootloader.unlocked' && f.level === 'warning'));
  assert.ok(findings.some((f) => f.messageKey === 'security.playProtect.disabled'));
});

test('insecure build is critical', () => {
  const info: DeviceSecurityInfo = {
    isDebuggable: false,
    isSecure: false,
    suBinaryPresent: false,
  };
  const findings = analyzeSecurity(info);
  assert.ok(findings.some((f) => f.messageKey === 'security.insecure' && f.level === 'critical'));
});

test('unknown properties produce all-clear', () => {
  const info: DeviceSecurityInfo = {
    isDebuggable: false,
    isSecure: true,
    suBinaryPresent: false,
  };
  const findings = analyzeSecurity(info);
  assert.deepEqual(
    findings.map((f) => f.messageKey),
    ['security.allClear']
  );
});
