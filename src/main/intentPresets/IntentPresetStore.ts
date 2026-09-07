// Порт Sources/AdbShell/Services/IntentPresetStore.swift — сохранённые
// deep link/intent-пресеты. UserDefaults заменён на
// userData/intent-presets.json.

import { app } from 'electron';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { IntentPreset } from '../adb/types/IntentPreset';
import { addPreset, removePreset } from './intentPresetsLogic';
import { loadJsonStore, saveJsonStore } from '../util/jsonStore';

const CONFIG_FILE = 'intent-presets.json';

export class IntentPresetStore {
  private presets: IntentPreset[];

  constructor() {
    this.presets = loadJsonStore<IntentPreset[]>(this.configPath, Array.isArray, []);
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private save(): void {
    saveJsonStore(this.configPath, this.presets);
  }

  list(): IntentPreset[] {
    return this.presets;
  }

  add(name: string, uri: string): IntentPreset[] {
    this.presets = addPreset(this.presets, name, uri, () => randomUUID());
    this.save();
    return this.presets;
  }

  remove(id: string): IntentPreset[] {
    this.presets = removePreset(this.presets, id);
    this.save();
    return this.presets;
  }
}
