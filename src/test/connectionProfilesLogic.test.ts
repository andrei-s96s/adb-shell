import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addProfile,
  removeProfile,
  toggleProfileAutoConnect,
  mergeImportedProfiles,
} from '../main/connectionProfiles/connectionProfilesLogic';
import { ConnectionProfile } from '../main/adb/types/ConnectionProfile';

// Тестовые кейсы зеркалят Tests/AdbShellTests/ConnectionProfileStoreTests.swift.

let nextId = 0;
const makeId = () => `id-${nextId++}`;

test('add creates profile', () => {
  const profiles = addProfile([], 'Head unit', '192.168.1.50:5555', makeId);
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].name, 'Head unit');
  assert.equal(profiles[0].autoConnect, false);
});

test('add with blank name falls back to host', () => {
  const profiles = addProfile([], '  ', '192.168.1.50:5555', makeId);
  assert.equal(profiles[0].name, '192.168.1.50:5555');
});

test('adding same host twice updates name instead of duplicating', () => {
  let profiles = addProfile([], 'First', '192.168.1.50:5555', makeId);
  profiles = addProfile(profiles, 'Second', '192.168.1.50:5555', makeId);
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].name, 'Second');
});

test('blank host is ignored', () => {
  const profiles = addProfile([], 'X', '   ', makeId);
  assert.deepEqual(profiles, []);
});

test('toggle auto-connect flips flag', () => {
  let profiles = addProfile([], 'Head unit', '192.168.1.50:5555', makeId);
  const id = profiles[0].id;
  profiles = toggleProfileAutoConnect(profiles, id);
  assert.equal(profiles[0].autoConnect, true);
  profiles = toggleProfileAutoConnect(profiles, id);
  assert.equal(profiles[0].autoConnect, false);
});

test('remove deletes profile', () => {
  let profiles = addProfile([], 'Head unit', '192.168.1.50:5555', makeId);
  profiles = removeProfile(profiles, profiles[0].id);
  assert.deepEqual(profiles, []);
});

test('importing the same profile twice does not duplicate', () => {
  const imported: ConnectionProfile[] = [{ id: 'shared-id', name: 'X', host: '1.2.3.4:5555', autoConnect: false }];
  let profiles = mergeImportedProfiles([], imported);
  profiles = mergeImportedProfiles(profiles, imported);
  assert.equal(profiles.length, 1);
});
