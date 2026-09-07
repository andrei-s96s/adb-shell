import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEntry, sortedByStartedAt, MAX_RUN_HISTORY_ENTRIES } from '../main/macroRunHistory/macroRunHistoryLogic';
import { MacroRunHistoryEntry } from '../main/macroRunHistory/macroRunHistoryLogic';

function entry(id: string, startedAtMs: number, completedFully = true): MacroRunHistoryEntry {
  return {
    id,
    macroId: 'macro-1',
    macroName: 'Flash',
    serial: 'R58N30ABCDE',
    deviceLabel: 'Pixel 8 Pro',
    startedAtMs,
    completedFully,
    results: [],
  };
}

test('addEntry appends a new entry', () => {
  const history = addEntry([], entry('a', 1000));
  assert.equal(history.length, 1);
  assert.equal(history[0].id, 'a');
});

test('addEntry caps history to MAX_RUN_HISTORY_ENTRIES, dropping the oldest', () => {
  let history: MacroRunHistoryEntry[] = [];
  for (let i = 0; i < MAX_RUN_HISTORY_ENTRIES + 5; i++) {
    history = addEntry(history, entry(`e${i}`, i * 1000));
  }
  assert.equal(history.length, MAX_RUN_HISTORY_ENTRIES);
  assert.ok(!history.some((e) => e.id === 'e0'));
  assert.ok(history.some((e) => e.id === `e${MAX_RUN_HISTORY_ENTRIES + 4}`));
});

test('sortedByStartedAt orders most recent first', () => {
  const history = [entry('a', 100), entry('b', 300), entry('c', 200)];
  assert.deepEqual(
    sortedByStartedAt(history).map((e) => e.id),
    ['b', 'c', 'a']
  );
});
