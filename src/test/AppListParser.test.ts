import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeApps } from '../main/adb/parsers/AppListParser';

test('flags system and disabled apps', () => {
  const all = ['package:com.android.settings', 'package:com.example.userapp', 'package:com.example.disabledapp'].join('\n');
  const user = ['package:com.example.userapp', 'package:com.example.disabledapp'].join('\n');
  const disabled = 'package:com.example.disabledapp';

  const apps = mergeApps(all, user, disabled);
  const byName = new Map(apps.map((a) => [a.packageName, a]));

  assert.equal(apps.length, 3);
  assert.equal(byName.get('com.android.settings')?.isSystem, true);
  assert.equal(byName.get('com.android.settings')?.isEnabled, true);
  assert.equal(byName.get('com.example.userapp')?.isSystem, false);
  assert.equal(byName.get('com.example.userapp')?.isEnabled, true);
  assert.equal(byName.get('com.example.disabledapp')?.isSystem, false);
  assert.equal(byName.get('com.example.disabledapp')?.isEnabled, false);
});

test('sorted case-insensitively', () => {
  const all = ['package:com.Zebra.app', 'package:com.alpha.app'].join('\n');
  const apps = mergeApps(all, '', '');
  assert.deepEqual(
    apps.map((a) => a.packageName),
    ['com.alpha.app', 'com.Zebra.app']
  );
});

test('empty input produces empty list', () => {
  assert.deepEqual(mergeApps('', '', ''), []);
});
