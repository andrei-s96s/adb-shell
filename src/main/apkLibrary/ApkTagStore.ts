// Порт Sources/AdbShell/Services/ApkTagStore.swift — пользовательские теги
// для файлов библиотеки APK, по полному пути (файлы не хранят метаданные
// сами по себе). UserDefaults заменён на userData/apk-tags.json.

import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { TagsByPath, addTag, removeTag, allTags } from './apkTagsLogic';

const CONFIG_FILE = 'apk-tags.json';

export class ApkTagStore {
  private tagsByPath: TagsByPath;

  constructor() {
    this.tagsByPath = this.load();
  }

  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
  }

  private load(): TagsByPath {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as TagsByPath) : {};
    } catch {
      return {};
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(this.tagsByPath));
    } catch {
      // Не критично — просто не переживёт перезапуск.
    }
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
