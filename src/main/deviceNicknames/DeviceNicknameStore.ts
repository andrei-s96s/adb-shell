// Порт Sources/AdbShell/Services/DeviceNicknameStore.swift —
// пользовательские имена устройств по serial, не зависят от adb model, не
// сбрасываются при переподключении. UserDefaults заменён на
// userData/device-nicknames.json.

import { app } from 'electron';
import * as path from 'node:path';

import { NicknameMap, applySetNickname } from './deviceNicknamesLogic';
import { loadJsonStore, saveJsonStore } from '../util/jsonStore';

const CONFIG_FILE = 'device-nicknames.json';

export class DeviceNicknameStore {
  private nicknames: NicknameMap;

  constructor() {
    this.nicknames = loadJsonStore<NicknameMap>(this.configPath, (p) => !!p && typeof p === 'object', {});
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  list(): NicknameMap {
    return this.nicknames;
  }

  setNickname(serial: string, name: string): NicknameMap {
    this.nicknames = applySetNickname(this.nicknames, serial, name);
    saveJsonStore(this.configPath, this.nicknames);
    return this.nicknames;
  }
}
