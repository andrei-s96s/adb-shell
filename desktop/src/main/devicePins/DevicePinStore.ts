// Персистентное хранилище закреплённых устройств — userData/pinned-devices.json.
// См. комментарий в devicePinsLogic.ts про отличие от Swift-оригинала
// (там pinnedSerials не переживают перезапуск приложения).

import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { togglePin } from './devicePinsLogic';

const CONFIG_FILE = 'pinned-devices.json';

export class DevicePinStore {
  private pinnedSerials: string[];

  constructor() {
    this.pinnedSerials = this.load();
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private load(): string[] {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.pinnedSerials));
    } catch {
      // Не критично — просто не переживёт перезапуск.
    }
  }

  list(): string[] {
    return this.pinnedSerials;
  }

  toggle(serial: string): string[] {
    this.pinnedSerials = togglePin(this.pinnedSerials, serial);
    this.save();
    return this.pinnedSerials;
  }
}
