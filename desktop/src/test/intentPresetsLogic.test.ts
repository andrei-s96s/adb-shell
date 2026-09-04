import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPreset, removePreset } from '../main/intentPresets/intentPresetsLogic';

let nextId = 0;
const makeId = () => `id-${nextId++}`;

test('adds a preset with trimmed name and uri', () => {
  const presets = addPreset([], '  Open Settings  ', '  myapp://settings  ', makeId);
  assert.equal(presets.length, 1);
  assert.equal(presets[0].name, 'Open Settings');
  assert.equal(presets[0].uri, 'myapp://settings');
});

test('blank name falls back to uri', () => {
  const presets = addPreset([], '   ', 'myapp://settings', makeId);
  assert.equal(presets[0].name, 'myapp://settings');
});

test('blank uri is ignored entirely', () => {
  assert.deepEqual(addPreset([], 'Name', '   ', makeId), []);
});

test('remove deletes by id', () => {
  let presets = addPreset([], 'X', 'myapp://x', makeId);
  presets = removePreset(presets, presets[0].id);
  assert.deepEqual(presets, []);
});
