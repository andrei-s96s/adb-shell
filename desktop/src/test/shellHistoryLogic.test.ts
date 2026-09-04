import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordCommand,
  favoriteCommand,
  toggleFavorite,
  removeCommand,
  favoriteCommands,
  recentCommands,
  SavedCommand,
} from '../main/shellHistory/shellHistoryLogic';

let nextId = 0;
const makeId = () => `id-${nextId++}`;

test('recording a new command adds it', () => {
  const items = recordCommand([], 'shell pm list packages', 1000, makeId);
  assert.equal(items.length, 1);
  assert.equal(items[0].text, 'shell pm list packages');
  assert.equal(items[0].isFavorite, false);
});

test('recording an existing command updates lastUsed instead of duplicating', () => {
  let items = recordCommand([], 'root', 1000, makeId);
  items = recordCommand(items, 'root', 2000, makeId);
  assert.equal(items.length, 1);
  assert.equal(items[0].lastUsedMs, 2000);
});

test('recording trims only non-favorites beyond the 50-item cap, favorites survive', () => {
  let items: SavedCommand[] = [{ id: 'fav', text: 'favorite-cmd', isFavorite: true, lastUsedMs: 0 }];
  for (let i = 0; i < 55; i++) {
    items = recordCommand(items, `cmd-${i}`, i + 1, makeId);
  }
  const recent = recentCommands(items);
  assert.equal(recent.length, 50);
  // The oldest non-favorite commands (cmd-0..cmd-4) should have been evicted.
  assert.ok(!recent.some((i) => i.text === 'cmd-0'));
  assert.ok(recent.some((i) => i.text === 'cmd-54'));
  assert.ok(items.some((i) => i.text === 'favorite-cmd'));
});

test('favoriteCommand marks an existing command as favorite without duplicating', () => {
  let items = recordCommand([], 'reboot', 1000, makeId);
  items = favoriteCommand(items, 'reboot', 2000, makeId);
  assert.equal(items.length, 1);
  assert.equal(items[0].isFavorite, true);
});

test('favoriteCommand creates a new favorite entry when the text is not yet known', () => {
  const items = favoriteCommand([], 'shell getprop', 1000, makeId);
  assert.equal(items.length, 1);
  assert.equal(items[0].isFavorite, true);
});

test('toggleFavorite flips the flag by id', () => {
  let items = recordCommand([], 'root', 1000, makeId);
  const id = items[0].id;
  items = toggleFavorite(items, id);
  assert.equal(items[0].isFavorite, true);
  items = toggleFavorite(items, id);
  assert.equal(items[0].isFavorite, false);
});

test('removeCommand deletes by id', () => {
  let items = recordCommand([], 'root', 1000, makeId);
  items = removeCommand(items, items[0].id);
  assert.deepEqual(items, []);
});

test('favoriteCommands is sorted case-insensitively, recentCommands sorted by most-recent-first', () => {
  let items: SavedCommand[] = [];
  items = favoriteCommand(items, 'zebra', 0, makeId);
  items = favoriteCommand(items, 'Apple', 0, makeId);
  assert.deepEqual(
    favoriteCommands(items).map((i) => i.text),
    ['Apple', 'zebra']
  );

  items = recordCommand(items, 'first', 100, makeId);
  items = recordCommand(items, 'second', 200, makeId);
  assert.deepEqual(
    recentCommands(items).map((i) => i.text),
    ['second', 'first']
  );
});
