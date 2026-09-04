// Порт бизнес-логики ConnectionProfileStore из
// Sources/AdbShell/Services/ConnectionProfileStore.swift — чистые функции,
// не зависящие от electron/fs, чтобы оставаться тестируемыми напрямую.
// ConnectionProfileStore.ts оборачивает их персистентностью (userData JSON).

import { ConnectionProfile } from '../adb/types/ConnectionProfile';

/** Добавляет профиль, либо (если host уже есть у существующего профиля)
 * обновляет его имя вместо создания дубликата. Пустой (после trim) host
 * игнорируется целиком. */
export function addProfile(
  profiles: ConnectionProfile[],
  name: string,
  host: string,
  makeId: () => string
): ConnectionProfile[] {
  const trimmedHost = host.trim();
  if (trimmedHost.length === 0) return profiles;
  const trimmedName = name.trim();
  const finalName = trimmedName.length > 0 ? trimmedName : trimmedHost;

  const existingIndex = profiles.findIndex((p) => p.host === trimmedHost);
  if (existingIndex >= 0) {
    const updated = [...profiles];
    updated[existingIndex] = { ...updated[existingIndex], name: finalName };
    return updated;
  }
  return [...profiles, { id: makeId(), name: finalName, host: trimmedHost, autoConnect: false }];
}

export function removeProfile(profiles: ConnectionProfile[], id: string): ConnectionProfile[] {
  return profiles.filter((p) => p.id !== id);
}

export function toggleProfileAutoConnect(profiles: ConnectionProfile[], id: string): ConnectionProfile[] {
  return profiles.map((p) => (p.id === id ? { ...p, autoConnect: !p.autoConnect } : p));
}

/** Импорт из JSON, экспортированного другой машиной — добавляет только
 * профили, которых ещё нет по id (повторный импорт не плодит дубликаты). */
export function mergeImportedProfiles(
  profiles: ConnectionProfile[],
  imported: ConnectionProfile[]
): ConnectionProfile[] {
  const existingIds = new Set(profiles.map((p) => p.id));
  return [...profiles, ...imported.filter((p) => !existingIds.has(p.id))];
}
