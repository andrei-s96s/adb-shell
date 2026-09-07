// Порт Sources/AdbShell/Services/MacroStore.swift — персистентное хранилище
// макросов. UserDefaults заменён на userData/macros.json.

import { app } from 'electron';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { Macro, MacroStep } from '../adb/types/Macro';
import { addMacro, updateMacro, removeMacro, mergeImportedMacros, addMacroTag, removeMacroTag } from './macrosLogic';
import { loadJsonStore, saveJsonStore } from '../util/jsonStore';

const CONFIG_FILE = 'macros.json';

export class MacroStore {
  private macros: Macro[];

  constructor() {
    this.macros = loadJsonStore<Macro[]>(this.configPath, Array.isArray, []);
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private save(): void {
    saveJsonStore(this.configPath, this.macros);
  }

  list(): Macro[] {
    return this.macros;
  }

  get(id: string): Macro | undefined {
    return this.macros.find((m) => m.id === id);
  }

  add(
    name: string,
    steps: MacroStep[],
    autorunOnConnect: boolean,
    abortOnFirstFailure: boolean,
    hotkeyAccelerator?: string,
    scheduleIntervalMinutes?: number
  ): Macro[] {
    this.macros = addMacro(
      this.macros,
      name,
      steps,
      autorunOnConnect,
      abortOnFirstFailure,
      () => randomUUID(),
      hotkeyAccelerator,
      scheduleIntervalMinutes
    );
    this.save();
    return this.macros;
  }

  update(
    id: string,
    name: string,
    steps: MacroStep[],
    autorunOnConnect: boolean,
    abortOnFirstFailure: boolean,
    hotkeyAccelerator?: string,
    scheduleIntervalMinutes?: number
  ): Macro[] {
    this.macros = updateMacro(
      this.macros,
      id,
      name,
      steps,
      autorunOnConnect,
      abortOnFirstFailure,
      hotkeyAccelerator,
      scheduleIntervalMinutes
    );
    this.save();
    return this.macros;
  }

  remove(id: string): Macro[] {
    this.macros = removeMacro(this.macros, id);
    this.save();
    return this.macros;
  }

  addTag(id: string, tag: string): Macro[] {
    this.macros = addMacroTag(this.macros, id, tag);
    this.save();
    return this.macros;
  }

  removeTag(id: string, tag: string): Macro[] {
    this.macros = removeMacroTag(this.macros, id, tag);
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
