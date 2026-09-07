// Порт Sources/AdbShell/Services/ShellHistoryStore.swift. UserDefaults
// заменён на userData/shell-history.json.

import { app } from 'electron';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { SavedCommand, recordCommand, favoriteCommand, toggleFavorite, removeCommand } from './shellHistoryLogic';
import { loadJsonStore, saveJsonStore } from '../util/jsonStore';

const CONFIG_FILE = 'shell-history.json';

export class ShellHistoryStore {
  private items: SavedCommand[];

  constructor() {
    this.items = loadJsonStore<SavedCommand[]>(this.configPath, Array.isArray, []);
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private save(): void {
    saveJsonStore(this.configPath, this.items);
  }

  list(): SavedCommand[] {
    return this.items;
  }

  record(text: string): SavedCommand[] {
    this.items = recordCommand(this.items, text, Date.now(), () => randomUUID());
    this.save();
    return this.items;
  }

  favorite(text: string): SavedCommand[] {
    this.items = favoriteCommand(this.items, text, Date.now(), () => randomUUID());
    this.save();
    return this.items;
  }

  toggleFavorite(id: string): SavedCommand[] {
    this.items = toggleFavorite(this.items, id);
    this.save();
    return this.items;
  }

  remove(id: string): SavedCommand[] {
    this.items = removeCommand(this.items, id);
    this.save();
    return this.items;
  }

  clear(): SavedCommand[] {
    this.items = [];
    this.save();
    return this.items;
  }
}
