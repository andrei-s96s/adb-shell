// Персистентное хранилище истории подключений -- userData/device-history.json.

import { app } from 'electron';
import * as path from 'node:path';

import { Device } from '../adb/types/Device';
import { DeviceHistoryEntry, recordSeen, sortedByLastSeen, removeEntry } from './deviceHistoryLogic';
import { loadJsonStore, saveJsonStore } from '../util/jsonStore';

const CONFIG_FILE = 'device-history.json';

export class DeviceHistoryStore {
  private history: DeviceHistoryEntry[];

  constructor() {
    this.history = loadJsonStore<DeviceHistoryEntry[]>(this.configPath, Array.isArray, []);
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private save(): void {
    saveJsonStore(this.configPath, this.history);
  }

  list(): DeviceHistoryEntry[] {
    return sortedByLastSeen(this.history);
  }

  /** Вызывается на каждый adb:listDevices -- recordSeen сам решает, нужно
   * ли что-то реально менять (см. MIN_RECORD_INTERVAL_MS в
   * deviceHistoryLogic.ts), сравнение по ссылке ниже избегает записи на
   * диск, когда список вернулся неизменным. */
  recordSeen(devices: Device[]): void {
    const next = recordSeen(this.history, devices, Date.now());
    if (next === this.history) return;
    this.history = next;
    this.save();
  }

  remove(serial: string): DeviceHistoryEntry[] {
    this.history = removeEntry(this.history, serial);
    this.save();
    return this.list();
  }

  clear(): DeviceHistoryEntry[] {
    this.history = [];
    this.save();
    return [];
  }
}
