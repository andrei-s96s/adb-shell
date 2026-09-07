// Чистая логика истории подключений -- список устройств, которые хотя бы
// раз были видны в `adb devices`, с моделью/product и временем первого и
// последнего появления. В отличие от текущего списка устройств (Device.ts),
// переживает отключение/перезапуск приложения -- отдельная персистентная
// история, а не снимок состояния прямо сейчас.

import { Device } from '../adb/types/Device';

export interface DeviceHistoryEntry {
  serial: string;
  model?: string;
  product?: string;
  firstSeenMs: number;
  lastSeenMs: number;
}

/** Не обновлять lastSeenMs чаще этого промежутка, если ничего кроме самого
 * времени не изменилось -- recordSeen зовётся на каждый adb:listDevices
 * (поллинг раз в 3с в renderer.ts), без этого порога КАЖДЫЙ такой вызов
 * писал бы JSON на диск, хотя устройство просто "всё ещё здесь". Для истории
 * подключений точность до минуты более чем достаточна. */
const MIN_RECORD_INTERVAL_MS = 60_000;

export const MAX_HISTORY_ENTRIES = 100;

/** Обновляет историю по текущему списку устройств. Возвращает ТОТ ЖЕ
 * массив (по ссылке), если ничего существенного не изменилось -- вызывающий
 * код (DeviceHistoryStore) сравнивает по ссылке, чтобы решить, нужно ли
 * писать на диск, не сравнивая содержимое вручную. */
export function recordSeen(history: DeviceHistoryEntry[], devices: Device[], nowMs: number): DeviceHistoryEntry[] {
  let next = history;
  let changed = false;

  for (const device of devices) {
    const index = next.findIndex((e) => e.serial === device.serial);
    const existing = index >= 0 ? next[index] : undefined;
    const sameInfo = !!existing && existing.model === device.model && existing.product === device.product;
    if (existing && sameInfo && nowMs - existing.lastSeenMs < MIN_RECORD_INTERVAL_MS) continue;

    const entry: DeviceHistoryEntry = {
      serial: device.serial,
      model: device.model,
      product: device.product,
      firstSeenMs: existing?.firstSeenMs ?? nowMs,
      lastSeenMs: nowMs,
    };
    next = existing ? next.map((e, i) => (i === index ? entry : e)) : [...next, entry];
    changed = true;
  }

  if (!changed) return history;
  return capHistory(next);
}

/** Отбрасывает самые старые (по lastSeenMs) записи сверх лимита -- история
 * подключений не должна расти бесконечно у пользователя, который годами
 * подключает разные тестовые устройства. */
function capHistory(history: DeviceHistoryEntry[]): DeviceHistoryEntry[] {
  if (history.length <= MAX_HISTORY_ENTRIES) return history;
  return sortedByLastSeen(history).slice(0, MAX_HISTORY_ENTRIES);
}

export function sortedByLastSeen(history: DeviceHistoryEntry[]): DeviceHistoryEntry[] {
  return [...history].sort((a, b) => b.lastSeenMs - a.lastSeenMs);
}

export function removeEntry(history: DeviceHistoryEntry[], serial: string): DeviceHistoryEntry[] {
  return history.filter((e) => e.serial !== serial);
}
