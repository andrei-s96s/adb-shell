// Порт Sources/AdbShell/Services/DeviceNicknameStore.swift —
// пользовательские имена устройств по serial, не зависят от adb model, не
// сбрасываются при переподключении. UserDefaults заменён на
// userData/device-nicknames.json.

import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { NicknameMap, applySetNickname } from './deviceNicknamesLogic';

const CONFIG_FILE = 'device-nicknames.json';

export class DeviceNicknameStore {
  private nicknames: NicknameMap;

  constructor() {
    this.nicknames = this.load();
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private load(): NicknameMap {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as NicknameMap) : {};
    } catch {
      return {};
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.nicknames));
    } catch {
      // Не критично — просто не переживёт перезапуск.
    }
  }

  list(): NicknameMap {
    return this.nicknames;
  }

  setNickname(serial: string, name: string): NicknameMap {
    this.nicknames = applySetNickname(this.nicknames, serial, name);
    this.save();
    return this.nicknames;
  }
}
