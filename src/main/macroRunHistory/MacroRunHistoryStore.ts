// Персистентное хранилище журнала запусков макросов -- userData/macro-run-history.json.

import { app } from 'electron';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { Macro, MacroRunResult } from '../adb/types/Macro';
import { MacroRunHistoryEntry, addEntry, sortedByStartedAt } from './macroRunHistoryLogic';
import { loadJsonStore, saveJsonStore } from '../util/jsonStore';

const CONFIG_FILE = 'macro-run-history.json';

export class MacroRunHistoryStore {
  private history: MacroRunHistoryEntry[];

  constructor() {
    this.history = loadJsonStore<MacroRunHistoryEntry[]>(this.configPath, Array.isArray, []);
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private save(): void {
    saveJsonStore(this.configPath, this.history);
  }

  list(): MacroRunHistoryEntry[] {
    return sortedByStartedAt(this.history);
  }

  record(
    macro: Macro,
    serial: string,
    deviceLabel: string,
    startedAtMs: number,
    completedFully: boolean,
    results: MacroRunResult[]
  ): void {
    const entry: MacroRunHistoryEntry = {
      id: randomUUID(),
      macroId: macro.id,
      macroName: macro.name,
      serial,
      deviceLabel,
      startedAtMs,
      completedFully,
      results,
    };
    this.history = addEntry(this.history, entry);
    this.save();
  }

  clear(): MacroRunHistoryEntry[] {
    this.history = [];
    this.save();
    return [];
  }
}
