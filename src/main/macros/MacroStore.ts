// Порт Sources/AdbShell/Services/MacroStore.swift — персистентное хранилище
// макросов. UserDefaults заменён на userData/macros.json.

import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { Macro } from '../adb/types/Macro';
import { addMacro, updateMacro, removeMacro, mergeImportedMacros } from './macrosLogic';

const CONFIG_FILE = 'macros.json';

export class MacroStore {
  private macros: Macro[];

  constructor() {
    this.macros = this.load();
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private load(): Macro[] {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as Macro[]) : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.macros));
    } catch {
      // Не критично — просто не переживёт перезапуск.
    }
  }

  list(): Macro[] {
    return this.macros;
  }

  get(id: string): Macro | undefined {
    return this.macros.find((m) => m.id === id);
  }

  add(name: string, rawText: string, autorunOnConnect: boolean, abortOnFirstFailure: boolean): Macro[] {
    this.macros = addMacro(this.macros, name, rawText, autorunOnConnect, abortOnFirstFailure, () => randomUUID());
    this.save();
    return this.macros;
  }

  update(id: string, name: string, rawText: string, autorunOnConnect: boolean, abortOnFirstFailure: boolean): Macro[] {
    this.macros = updateMacro(this.macros, id, name, rawText, autorunOnConnect, abortOnFirstFailure, () => randomUUID());
    this.save();
    return this.macros;
  }

  remove(id: string): Macro[] {
    this.macros = removeMacro(this.macros, id);
    this.save();
    return this.macros;
  }

  importJSON(raw: string): Macro[] {
    const imported = JSON.parse(raw) as Macro[];
    this.macros = mergeImportedMacros(this.macros, imported);
    this.save();
    return this.macros;
  }

  exportJSON(): string {
    return JSON.stringify(this.macros, null, 2);
  }
}
