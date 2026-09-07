// Порт Sources/AdbShell/Services/ApkTagStore.swift — пользовательские теги
// для файлов библиотеки APK, по полному пути (файлы не хранят метаданные
// сами по себе). UserDefaults заменён на userData/apk-tags.json.

import { app } from 'electron';
import * as path from 'node:path';

import { TagsByPath, addTag, removeTag, allTags } from './apkTagsLogic';
import { loadJsonStore, saveJsonStore } from '../util/jsonStore';

const CONFIG_FILE = 'apk-tags.json';

export class ApkTagStore {
  private tagsByPath: TagsByPath;

  constructor() {
    this.tagsByPath = loadJsonStore<TagsByPath>(this.configPath, (p) => !!p && typeof p === 'object', {});
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private save(): void {
    saveJsonStore(this.configPath, this.tagsByPath);
  }

  list(): TagsByPath {
    return this.tagsByPath;
  }

  get all(): string[] {
    return allTags(this.tagsByPath);
  }

  addTag(filePath: string, tag: string): TagsByPath {
    this.tagsByPath = addTag(this.tagsByPath, filePath, tag);
    this.save();
    return this.tagsByPath;
  }

  removeTag(filePath: string, tag: string): TagsByPath {
    this.tagsByPath = removeTag(this.tagsByPath, filePath, tag);
    this.save();
    return this.tagsByPath;
  }
}
