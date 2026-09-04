// Порт Sources/AdbShell/Services/IntentPresetStore.swift — сохранённые
// deep link/intent-пресеты. UserDefaults заменён на
// userData/intent-presets.json.

import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { IntentPreset } from '../adb/types/IntentPreset';
import { addPreset, removePreset } from './intentPresetsLogic';

const CONFIG_FILE = 'intent-presets.json';

export class IntentPresetStore {
  private presets: IntentPreset[];

  constructor() {
    this.presets = this.load();
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private load(): IntentPreset[] {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as IntentPreset[]) : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.presets));
    } catch {
      // Не критично — просто не переживёт перезапуск.
    }
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
