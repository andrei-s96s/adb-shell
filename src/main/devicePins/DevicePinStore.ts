// Персистентное хранилище закреплённых устройств — userData/pinned-devices.json.
// См. комментарий в devicePinsLogic.ts про отличие от Swift-оригинала
// (там pinnedSerials не переживают перезапуск приложения).

import { app } from 'electron';
import * as path from 'node:path';

import { togglePin } from './devicePinsLogic';
import { loadJsonStore, saveJsonStore } from '../util/jsonStore';

const CONFIG_FILE = 'pinned-devices.json';

export class DevicePinStore {
  private pinnedSerials: string[];

  constructor() {
    this.pinnedSerials = loadJsonStore<string[]>(this.configPath, Array.isArray, []);
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  list(): string[] {
    return this.pinnedSerials;
  }

  toggle(serial: string): string[] {
    this.pinnedSerials = togglePin(this.pinnedSerials, serial);
    saveJsonStore(this.configPath, this.pinnedSerials);
    return this.pinnedSerials;
  }
}
