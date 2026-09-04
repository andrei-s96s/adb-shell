// Порт Sources/AdbShell/Services/ShellHistoryStore.swift. UserDefaults
// заменён на userData/shell-history.json.

import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { SavedCommand, recordCommand, favoriteCommand, toggleFavorite, removeCommand } from './shellHistoryLogic';

const CONFIG_FILE = 'shell-history.json';

export class ShellHistoryStore {
  private items: SavedCommand[];

  constructor() {
    this.items = this.load();
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private load(): SavedCommand[] {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as SavedCommand[]) : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.items));
    } catch {
      // Не критично — просто не переживёт перезапуск.
    }
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
