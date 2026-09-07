// Общее правило "на какие устройства бьёт batch-операция" -- буквально все
// готовые, либо только те, что сейчас видны под активным тегом-фильтром
// сайдбара (getDeviceTagFilter() в state.ts -- тот же фильтр, что уже сужает
// список устройств в сайдбаре, см. renderer.ts). Мысль в том, чтобы "на все"
// у broadcast/зеркалирования/скриншота/установки/запуска макроса значило то
// же множество устройств, что пользователь и так уже видит перед собой в
// сайдбаре, а не скрытое от него отдельное "все подключённые вообще".
//
// Используется двумя способами: там, где итоговый список серийников/файлов
// собирает сам renderer (mirrorAll/runBroadcast в shellScreen.ts) --
// filterDevicesByTag() ниже; там, где фильтрация по тегу уходит на main-
// сторону вместе с остальными параметрами IPC-вызова (adb:screenshotAllDevices,
// apkLibrary:installToAllDevices, macros:runOnAll) -- сам renderer передаёт
// getDeviceTagFilter() как есть, а batchTargetLabel() ниже только поясняет
// пользователю в подписи кнопки/логе, что именно сейчас имеется в виду под
// "все".

import { adbApi } from './api.js';
import { getDeviceTagFilter } from './state.js';

/** Поясняющая приписка для кнопки/лога -- пусто, если фильтр не активен
 * (тогда "все" без оговорок буквально значит "все"). */
export function batchTargetLabel(): string {
  const tag = getDeviceTagFilter();
  return tag ? ` (тег «${tag}»)` : '';
}

/** Сужает список устройств до тех, что несут активный тег-фильтр -- no-op,
 * если фильтр сейчас не выбран. Если сам список тегов не удалось получить,
 * возвращает устройства БЕЗ фильтрации -- лучше выполнить операцию на всех
 * (то же поведение, что было бы без этой фичи вообще), чем молча выполнить
 * её на нуле устройств из-за временной ошибки IPC. */
export async function filterDevicesByTag<T extends { serial: string }>(devices: T[]): Promise<T[]> {
  const tag = getDeviceTagFilter();
  if (!tag) return devices;
  try {
    const tagsBySerial = await adbApi.deviceTagsList();
    return devices.filter((d) => (tagsBySerial[d.serial] ?? []).includes(tag));
  } catch {
    return devices;
  }
}
