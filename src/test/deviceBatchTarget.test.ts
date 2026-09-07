import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterReadyDevicesByTag } from '../main/util/deviceBatchTarget';
import { Device } from '../main/adb/types/Device';
import { DeviceTagStore } from '../main/deviceTags/DeviceTagStore';

function fakeTagStore(tagsBySerial: Record<string, string[]>): DeviceTagStore {
  return { list: () => tagsBySerial } as unknown as DeviceTagStore;
}

const deviceA: Device = { serial: 'A', state: 'device' };
const deviceB: Device = { serial: 'B', state: 'device' };
const deviceOffline: Device = { serial: 'C', state: 'offline' };

test('filterReadyDevicesByTag keeps only ready devices when no tag is given', () => {
  const result = filterReadyDevicesByTag([deviceA, deviceB, deviceOffline], fakeTagStore({}));
  assert.deepEqual(
    result.map((d) => d.serial),
    ['A', 'B']
  );
});

test('filterReadyDevicesByTag further narrows to devices carrying the given tag', () => {
  const tags = fakeTagStore({ A: ['test-bench'], B: ['prod'] });
  const result = filterReadyDevicesByTag([deviceA, deviceB, deviceOffline], tags, 'test-bench');
  assert.deepEqual(
    result.map((d) => d.serial),
    ['A']
  );
});

test('filterReadyDevicesByTag excludes an offline device even if it carries the tag', () => {
  const tags = fakeTagStore({ C: ['test-bench'] });
  const result = filterReadyDevicesByTag([deviceA, deviceOffline], tags, 'test-bench');
  assert.deepEqual(result, []);
});

test('filterReadyDevicesByTag returns an empty array when nothing carries the tag', () => {
  const result = filterReadyDevicesByTag([deviceA, deviceB], fakeTagStore({}), 'nonexistent');
  assert.deepEqual(result, []);
});
