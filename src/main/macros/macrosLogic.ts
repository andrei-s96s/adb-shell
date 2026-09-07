// Порт бизнес-логики MacroStore из Sources/AdbShell/Services/MacroStore.swift
// — чистые функции, не зависящие от electron/fs.

import { Macro, MacroStep } from '../adb/types/Macro';

/** Разбирает вставленный текст (в том числе целиком вставленный .bat-скрипт
 * прошивки) на шаги макроса: берёт только строки, начинающиеся с `adb`
 * (регистронезависимо), убирает сам токен `adb` и флаг выбора устройства
 * (-d/-e/-s <serial>, если он был указан в скрипте) — serial макрос всегда
 * берёт от текущей выбранной вкладки устройства, а не из текста. Все прочие
 * строки (@echo off, chcp 1251, cls, pause, ipconfig, ifconfig и т.п. —
 * обычный шум .bat-файлов) молча пропускаются. */
export function parseSteps(rawText: string, makeId: () => string): MacroStep[] {
  const steps: MacroStep[] = [];
  for (const rawLine of rawText.split(/\r\n|\r|\n/)) {
    let line = rawLine.trim();
    if (!line.toLowerCase().startsWith('adb ')) continue;
    line = line.slice(4).trim();

    for (const flag of ['-d ', '-e ']) {
      if (line.toLowerCase().startsWith(flag)) {
        line = line.slice(flag.length).trim();
        break;
      }
    }
    if (line.toLowerCase().startsWith('-s ')) {
      const rest = line.slice(3).trim();
      const spaceIdx = rest.search(/\s/);
      if (spaceIdx === -1) continue;
      line = rest.slice(spaceIdx + 1).trim();
    }

    if (line.length === 0) continue;
    steps.push({ id: makeId(), argsLine: line });
  }
  return steps;
}

export function addMacro(
  macros: Macro[],
  name: string,
  rawText: string,
  autorunOnConnect: boolean,
  abortOnFirstFailure: boolean,
  makeId: () => string,
  hotkeyAccelerator?: string
): Macro[] {
  const trimmedName = name.trim();
  const steps = parseSteps(rawText, makeId);
  if (trimmedName.length === 0 || steps.length === 0) return macros;
  return [...macros, { id: makeId(), name: trimmedName, steps, autorunOnConnect, abortOnFirstFailure, hotkeyAccelerator }];
}

export function updateMacro(
  macros: Macro[],
  id: string,
  name: string,
  rawText: string,
  autorunOnConnect: boolean,
  abortOnFirstFailure: boolean,
  makeId: () => string,
  hotkeyAccelerator?: string
): Macro[] {
  const trimmedName = name.trim();
  const steps = parseSteps(rawText, makeId);
  if (trimmedName.length === 0 || steps.length === 0) return macros;
  return macros.map((m) => (m.id === id ? { ...m, name: trimmedName, steps, autorunOnConnect, abortOnFirstFailure, hotkeyAccelerator } : m));
}

export function removeMacro(macros: Macro[], id: string): Macro[] {
  return macros.filter((m) => m.id !== id);
}

/** Повторный импорт того же файла не плодит дубликаты — добавляет только
 * макросы, которых ещё нет по id. */
export function mergeImportedMacros(macros: Macro[], imported: Macro[]): Macro[] {
  const existingIds = new Set(macros.map((m) => m.id));
  return [...macros, ...imported.filter((m) => !existingIds.has(m.id))];
}

/** Порт семантики addTag/removeTag/allTags из apkTagsLogic.ts (ApkTagStore),
 * адаптированный под массив макросов с id вместо словаря "путь -> теги" --
 * см. комментарий у Macro.tags. */
export function addMacroTag(macros: Macro[], id: string, tag: string): Macro[] {
  const trimmed = tag.trim();
  if (trimmed.length === 0) return macros;
  return macros.map((m) => {
    if (m.id !== id) return m;
    const existing = m.tags ?? [];
    if (existing.includes(trimmed)) return m;
    return { ...m, tags: [...existing, trimmed] };
  });
}

/** Пустой список тегов после удаления убирает поле tags целиком (undefined),
 * а не оставляет пустой массив -- держит персистентный JSON компактным, тот
 * же выбор, что и в ApkTagStore.removeTag. */
export function removeMacroTag(macros: Macro[], id: string, tag: string): Macro[] {
  return macros.map((m) => {
    if (m.id !== id) return m;
    const remaining = (m.tags ?? []).filter((t) => t !== tag);
    return { ...m, tags: remaining.length === 0 ? undefined : remaining };
  });
}

export function allMacroTags(macros: Macro[]): string[] {
  const set = new Set<string>();
  for (const macro of macros) {
    for (const tag of macro.tags ?? []) set.add(tag);
  }
  return [...set].sort();
}
