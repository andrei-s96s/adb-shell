// Порт бизнес-логики ShellHistoryStore из
// Sources/AdbShell/Services/ShellHistoryStore.swift — персистентная история
// shell-команд с избранным.

export interface SavedCommand {
  id: string;
  text: string;
  isFavorite: boolean;
  lastUsedMs: number;
}

const MAX_RECENT = 50;

/** Записывает команду в историю (или обновляет lastUsed, если такая уже
 * есть). Обрезает только НЕ-избранные до MAX_RECENT самых свежих — избранное
 * не теряется со временем, сколько бы команд ни выполнялось. */
export function recordCommand(items: SavedCommand[], text: string, nowMs: number, makeId: () => string): SavedCommand[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return items;

  const existingIndex = items.findIndex((i) => i.text === trimmed);
  let next =
    existingIndex >= 0
      ? items.map((item, i) => (i === existingIndex ? { ...item, lastUsedMs: nowMs } : item))
      : [...items, { id: makeId(), text: trimmed, isFavorite: false, lastUsedMs: nowMs }];

  const nonFavoriteOverflow = next
    .filter((i) => !i.isFavorite)
    .sort((a, b) => b.lastUsedMs - a.lastUsedMs)
    .slice(MAX_RECENT);
  if (nonFavoriteOverflow.length > 0) {
    const toRemove = new Set(nonFavoriteOverflow.map((i) => i.id));
    next = next.filter((i) => !toRemove.has(i.id));
  }
  return next;
}

export function favoriteCommand(items: SavedCommand[], text: string, nowMs: number, makeId: () => string): SavedCommand[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return items;
  const existingIndex = items.findIndex((i) => i.text === trimmed);
  if (existingIndex >= 0) {
    return items.map((item, i) => (i === existingIndex ? { ...item, isFavorite: true } : item));
  }
  return [...items, { id: makeId(), text: trimmed, isFavorite: true, lastUsedMs: nowMs }];
}

export function toggleFavorite(items: SavedCommand[], id: string): SavedCommand[] {
  return items.map((item) => (item.id === id ? { ...item, isFavorite: !item.isFavorite } : item));
}

export function removeCommand(items: SavedCommand[], id: string): SavedCommand[] {
  return items.filter((item) => item.id !== id);
}

export function favoriteCommands(items: SavedCommand[]): SavedCommand[] {
  return items.filter((i) => i.isFavorite).sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }));
}

export function recentCommands(items: SavedCommand[]): SavedCommand[] {
  return items.filter((i) => !i.isFavorite).sort((a, b) => b.lastUsedMs - a.lastUsedMs);
}
