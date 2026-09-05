// Мутируемая копия DEMO_FILESYSTEM в памяти -- живёт ровно один запуск
// демо-режима (создаётся вместе с DemoAdbService, не персистится), но
// mkdir/push/rm внутри одной демо-сессии реально меняют то, что покажет
// следующий `ls`, так что вкладка Файлы ощущается живой, а не статичной
// картинкой.

import { DemoRemoteEntry, DEMO_FILESYSTEM } from './demoData';

function normalize(dirPath: string): string {
  if (dirPath.length > 1 && dirPath.endsWith('/')) return dirPath.slice(0, -1);
  return dirPath.length === 0 ? '/' : dirPath;
}

export class DemoFileSystem {
  private tree: Record<string, DemoRemoteEntry[]>;

  constructor() {
    // Глубокая копия -- DEMO_FILESYSTEM остаётся неизменным эталоном между
    // включениями демо-режима (toggle off/on начинает с чистого состояния).
    this.tree = Object.fromEntries(Object.entries(DEMO_FILESYSTEM).map(([dir, entries]) => [dir, entries.map((e) => ({ ...e }))]));
  }

  list(dirPath: string): DemoRemoteEntry[] | undefined {
    return this.tree[normalize(dirPath)];
  }

  mkdir(dirPath: string): void {
    const path = normalize(dirPath);
    const parent = path.slice(0, path.lastIndexOf('/')) || '/';
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (name.length === 0) return;

    if (!this.tree[parent]) this.tree[parent] = [];
    if (!this.tree[parent].some((e) => e.name === name)) {
      this.tree[parent].push({ name, isDirectory: true, sizeBytes: 4096, modified: currentTimestamp() });
    }
    if (!this.tree[path]) this.tree[path] = [];
  }

  /** Регистрирует файл в дереве (push кладёт его в родительскую директорию,
   * если её ещё не было в фикстурах -- например, при push в свежесозданную
   * mkdir-папку). */
  registerFile(remotePath: string, sizeBytes: number): void {
    const path = normalize(remotePath);
    const parent = path.slice(0, path.lastIndexOf('/')) || '/';
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (!this.tree[parent]) this.tree[parent] = [];
    const existing = this.tree[parent].find((e) => e.name === name);
    if (existing) {
      existing.sizeBytes = sizeBytes;
      existing.modified = currentTimestamp();
    } else {
      this.tree[parent].push({ name, isDirectory: false, sizeBytes, modified: currentTimestamp() });
    }
  }

  remove(targetPath: string, recursive: boolean): void {
    const path = normalize(targetPath);
    const parent = path.slice(0, path.lastIndexOf('/')) || '/';
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (this.tree[parent]) {
      this.tree[parent] = this.tree[parent].filter((e) => e.name !== name);
    }
    if (recursive) delete this.tree[path];
  }
}

function currentTimestamp(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
