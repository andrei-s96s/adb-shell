import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordSeen, sortedByLastSeen, removeEntry, MAX_HISTORY_ENTRIES } from '../main/deviceHistory/deviceHistoryLogic';
import { Device } from '../main/adb/types/Device';

function device(serial: string, model?: string): Device {
  return { serial, state: 'device', model };
}

test('recordSeen adds a new entry with firstSeenMs === lastSeenMs', () => {
  const history = recordSeen([], [device('R58N30ABCDE', 'Voyah_HU')], 1000);
  assert.equal(history.length, 1);
  assert.deepEqual(history[0], { serial: 'R58N30ABCDE', model: 'Voyah_HU', product: undefined, firstSeenMs: 1000, lastSeenMs: 1000 });
});

test('recordSeen updates lastSeenMs but keeps firstSeenMs for an already-known device', () => {
  let history = recordSeen([], [device('R58N30ABCDE')], 1000);
  history = recordSeen(history, [device('R58N30ABCDE')], 999_999);
  assert.equal(history[0].firstSeenMs, 1000);
  assert.equal(history[0].lastSeenMs, 999_999);
});

test('recordSeen is a no-op (same array by reference) when nothing changed within the minimum interval', () => {
  const history = recordSeen([], [device('R58N30ABCDE', 'Voyah_HU')], 1000);
  const next = recordSeen(history, [device('R58N30ABCDE', 'Voyah_HU')], 1000 + 1000); // +1s, well under the 60s floor
  assert.equal(next, history);
});

test('recordSeen updates immediately when the model changes, even within the minimum interval', () => {
  const history = recordSeen([], [device('R58N30ABCDE', 'OldModel')], 1000);
  const next = recordSeen(history, [device('R58N30ABCDE', 'NewModel')], 1500);
  assert.notEqual(next, history);
  assert.equal(next[0].model, 'NewModel');
  assert.equal(next[0].firstSeenMs, 1000);
});

test('recordSeen tracks multiple devices independently', () => {
  const history = recordSeen([], [device('A'), device('B')], 1000);
  assert.equal(history.length, 2);
  assert.deepEqual(
    history.map((e) => e.serial),
    ['A', 'B']
  );
});

test('recordSeen caps history to MAX_HISTORY_ENTRIES, dropping the least recently seen', () => {
  let history = recordSeen([], [device('old')], 0);
  for (let i = 0; i < MAX_HISTORY_ENTRIES; i++) {
    history = recordSeen(history, [device(`new-${i}`)], (i + 1) * 100_000);
  }
  assert.equal(history.length, MAX_HISTORY_ENTRIES);
  assert.ok(!history.some((e) => e.serial === 'old'));
});

test('sortedByLastSeen orders most-recently-seen first', () => {
  const history = [
    { serial: 'A', firstSeenMs: 1, lastSeenMs: 100 },
    { serial: 'B', firstSeenMs: 1, lastSeenMs: 300 },
    { serial: 'C', firstSeenMs: 1, lastSeenMs: 200 },
  ];
  assert.deepEqual(
    sortedByLastSeen(history).map((e) => e.serial),
    ['B', 'C', 'A']
  );
});

test('removeEntry deletes by serial', () => {
  const history = [
    { serial: 'A', firstSeenMs: 1, lastSeenMs: 1 },
    { serial: 'B', firstSeenMs: 1, lastSeenMs: 1 },
  ];
  assert.deepEqual(
    removeEntry(history, 'A').map((e) => e.serial),
    ['B']
  );
});
