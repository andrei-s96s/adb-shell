// Чистая логика журнала запусков макросов -- отдельная персистентная
// история (кто/когда/где запускал макрос и чем это закончилось), а не
// текущее состояние экрана "Макросы" (там результат виден только пока
// открыта вкладка и пока не запущен другой макрос поверх).

import { MacroRunResult } from '../adb/types/Macro';

export interface MacroRunHistoryEntry {
  id: string;
  macroId: string;
  /** Имя макроса на момент запуска -- денормализовано специально: макрос
   * могут переименовать или удалить позже, а запись в истории должна
   * остаться осмысленной ("что именно запускалось"), а не "макрос #id,
   * которого больше нет". */
  macroName: string;
  serial: string;
  deviceLabel: string;
  startedAtMs: number;
  completedFully: boolean;
  results: MacroRunResult[];
}

/** Не больше этого числа записей -- история запусков может расти быстро
 * (в отличие от истории подключений устройств, где новая запись -- редкое
 * событие), особенно с периодическими макросами. Отбрасываются самые
 * старые по startedAtMs. */
export const MAX_RUN_HISTORY_ENTRIES = 300;

export function addEntry(history: MacroRunHistoryEntry[], entry: MacroRunHistoryEntry): MacroRunHistoryEntry[] {
  const next = [...history, entry];
  return capHistory(next);
}

function capHistory(history: MacroRunHistoryEntry[]): MacroRunHistoryEntry[] {
  if (history.length <= MAX_RUN_HISTORY_ENTRIES) return history;
  return sortedByStartedAt(history).slice(0, MAX_RUN_HISTORY_ENTRIES);
}

export function sortedByStartedAt(history: MacroRunHistoryEntry[]): MacroRunHistoryEntry[] {
  return [...history].sort((a, b) => b.startedAtMs - a.startedAtMs);
}
