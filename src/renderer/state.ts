// Простой стор текущего выбранного устройства — экраны подписываются, чтобы
// перезагрузить свои данные при смене устройства. Без фреймворка — этого
// достаточно для нынешнего размера интерфейса.

type Listener = (serial: string | undefined) => void;

let currentSerial: string | undefined;
const listeners: Listener[] = [];

export function getCurrentSerial(): string | undefined {
  return currentSerial;
}

export function setCurrentSerial(serial: string | undefined): void {
  currentSerial = serial;
  for (const listener of listeners) listener(serial);
}

export function onDeviceChanged(listener: Listener): void {
  listeners.push(listener);
}

/** Тег, выбранный чипом-фильтром над списком устройств в сайдбаре
 * (renderer.ts) -- источник истины один, но читают его и другие экраны
 * (shellScreen.ts, apkLibrary.ts, macros.ts), чтобы массовые "на все
 * устройства" операции (broadcast, зеркалирование, скриншот, установка,
 * запуск макроса) по умолчанию били не буквально по всем подключённым
 * устройствам, а по тем, что сейчас видны под текущим фильтром -- то же
 * самое множество, что пользователь и так уже смотрит в сайдбаре, а не
 * скрытое поведение мимо того, что на экране. undefined -- фильтр снят,
 * значит буквально "все". */
let deviceTagFilter: string | undefined;
const tagFilterListeners: Array<(tag: string | undefined) => void> = [];

export function getDeviceTagFilter(): string | undefined {
  return deviceTagFilter;
}

export function setDeviceTagFilter(tag: string | undefined): void {
  deviceTagFilter = tag;
  for (const listener of tagFilterListeners) listener(tag);
}

/** Для экранов, у которых где-то есть УЖЕ ОТРИСОВАННЫЙ, персистентный кусок
 * UI, зависящий от фильтра (например, title кнопки "На всех" в macros.ts) --
 * без подписки он оставался бы актуальным только на момент своего последнего
 * renderList(), а не на момент, когда фильтр реально сменился в сайдбаре
 * (renderer.ts меняет deviceTagFilter, но сам не знает, у кого из экранов
 * есть что переотрисовать). Экраны, которые лишь ЧИТАЮТ фильтр в момент
 * клика (shellScreen.ts/apkLibrary.ts -- статус пишется заново при каждом
 * запуске действия), в этой подписке не нуждаются: там устареть нечему. */
export function onDeviceTagFilterChanged(listener: (tag: string | undefined) => void): void {
  tagFilterListeners.push(listener);
}
