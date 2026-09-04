// Порт Sources/AdbShell/Services/ConnectionProfileStore.swift — сохранённые
// профили сетевого adb-подключения (IP/порт + имя), опционально с
// автоподключением при старте приложения. UserDefaults в оригинале заменён
// на userData/connection-profiles.json (см. ApkLibraryService для паттерна).

import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { ConnectionProfile } from '../adb/types/ConnectionProfile';
import { addProfile, removeProfile, toggleProfileAutoConnect, mergeImportedProfiles } from './connectionProfilesLogic';

const CONFIG_FILE = 'connection-profiles.json';

export class ConnectionProfileStore {
  private profiles: ConnectionProfile[];

  constructor() {
    this.profiles = this.load();
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private load(): ConnectionProfile[] {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as ConnectionProfile[]) : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.profiles));
    } catch {
      // Не критично — просто не переживёт перезапуск.
    }
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
