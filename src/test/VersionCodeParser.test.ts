import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersionCodes } from '../main/adb/parsers/VersionCodeParser';

// Тестовые кейсы зеркалят parseVersionCodes* из Tests/AdbShellTests/DumpsysParserTests.swift.

test('parses version codes for multiple packages from a bulk dump', () => {
  const output = [
    'Packages:',
    '  Package [com.example.app] (abcdef012345):',
    '    userId=10123',
    '    pkg=Package{...}',
    '    versionCode=42 minSdk=21 targetSdk=33',
    '    versionName=1.2.3',
    '',
    '  Package [com.other.app] (fedcba987654):',
    '    userId=10456',
    '    versionCode=7 minSdk=24 targetSdk=34',
    '    versionName=0.9.0',
    '',
    'Shared users:',
  ].join('\n');
  const codes = parseVersionCodes(output);
  assert.equal(codes['com.example.app'], 42);
  assert.equal(codes['com.other.app'], 7);
  assert.equal(Object.keys(codes).length, 2);
});

test('ignores secondary versionCode= lines within the same package block', () => {
  // Иногда внутри блока пакета встречается ещё одна строка с versionCode=
  // (например в info о конкретной install-сессии) — должна использоваться
  // первая, т.к. именно она соответствует установленной версии.
  const output = ['Package [com.example.app] (abcdef):', '  versionCode=42 minSdk=21 targetSdk=33', '  someOtherSection:', '    versionCode=999'].join(
    '\n'
  );
  const codes = parseVersionCodes(output);
  assert.equal(codes['com.example.app'], 42);
});

test('empty output produces an empty map', () => {
  assert.deepEqual(parseVersionCodes(''), {});
});

test('skips a package block without a versionCode line', () => {
  const output = ['Package [com.broken.app] (abcdef):', '  someField=1', 'Package [com.good.app] (fedcba):', '  versionCode=5'].join('\n');
  const codes = parseVersionCodes(output);
  assert.equal(codes['com.broken.app'], undefined);
  assert.equal(codes['com.good.app'], 5);
});
