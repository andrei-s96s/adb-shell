// Порт Sources/AdbShell/Services/ConnectionProfileStore.swift — сохранённые
// профили сетевого adb-подключения (IP/порт + имя), опционально с
// автоподключением при старте приложения. UserDefaults в оригинале заменён
// на userData/connection-profiles.json (см. ApkLibraryService для паттерна).

import { app } from 'electron';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { ConnectionProfile } from '../adb/types/ConnectionProfile';
import { addProfile, removeProfile, toggleProfileAutoConnect, mergeImportedProfiles } from './connectionProfilesLogic';
import { loadJsonStore, saveJsonStore } from '../util/jsonStore';

const CONFIG_FILE = 'connection-profiles.json';

export class ConnectionProfileStore {
  private profiles: ConnectionProfile[];

  constructor() {
    this.profiles = loadJsonStore<ConnectionProfile[]>(this.configPath, Array.isArray, []);
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private save(): void {
    saveJsonStore(this.configPath, this.profiles);
  }

  list(): ConnectionProfile[] {
    return this.profiles;
  }

  get autoConnectProfiles(): ConnectionProfile[] {
    return this.profiles.filter((p) => p.autoConnect);
  }

  add(name: string, host: string): ConnectionProfile[] {
    this.profiles = addProfile(this.profiles, name, host, () => randomUUID());
    this.save();
    return this.profiles;
  }

  remove(id: string): ConnectionProfile[] {
    this.profiles = removeProfile(this.profiles, id);
    this.save();
    return this.profiles;
  }

  toggleAutoConnect(id: string): ConnectionProfile[] {
    this.profiles = toggleProfileAutoConnect(this.profiles, id);
    this.save();
    return this.profiles;
  }

  clear(): ConnectionProfile[] {
    this.profiles = [];
    this.save();
    return this.profiles;
  }

  importJSON(raw: string): ConnectionProfile[] {
    const imported = JSON.parse(raw) as ConnectionProfile[];
    this.profiles = mergeImportedProfiles(this.profiles, imported);
    this.save();
    return this.profiles;
  }

  exportJSON(): string {
    return JSON.stringify(this.profiles, null, 2);
  }
}
