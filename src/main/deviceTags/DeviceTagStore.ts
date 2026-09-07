// Персистентное хранилище тегов устройств -- userData/device-tags.json.
// Структура и семантика 1:1 с ApkTagStore (apkLibrary/ApkTagStore.ts), но
// ключ -- serial устройства, а не путь к файлу.

import { app } from 'electron';
import * as path from 'node:path';

import { TagsBySerial, addTag, removeTag, allTags } from './deviceTagsLogic';
import { loadJsonStore, saveJsonStore } from '../util/jsonStore';

const CONFIG_FILE = 'device-tags.json';

export class DeviceTagStore {
  private tagsBySerial: TagsBySerial;

  constructor() {
    this.tagsBySerial = loadJsonStore<TagsBySerial>(this.configPath, (p) => !!p && typeof p === 'object', {});
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private save(): void {
    saveJsonStore(this.configPath, this.tagsBySerial);
  }

  list(): TagsBySerial {
    return this.tagsBySerial;
  }

  get all(): string[] {
    return allTags(this.tagsBySerial);
  }

  addTag(serial: string, tag: string): TagsBySerial {
    this.tagsBySerial = addTag(this.tagsBySerial, serial, tag);
    this.save();
    return this.tagsBySerial;
  }

  removeTag(serial: string, tag: string): TagsBySerial {
    this.tagsBySerial = removeTag(this.tagsBySerial, serial, tag);
    this.save();
    return this.tagsBySerial;
  }
}
