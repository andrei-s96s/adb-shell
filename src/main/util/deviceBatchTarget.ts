// Общий фильтр "готовые устройства, опционально сузить по тегу" -- одна и
// та же логика нужна всем "на все устройства" IPC-хендлерам
// (adb:screenshotAllDevices, apkLibrary:installToAllDevices,
// macros:runOnAll): renderer передаёt активный тег-фильтр сайдбара
// (getDeviceTagFilter() в state.ts, см. renderer/deviceBatchTarget.ts) как
// есть, а какие устройства реально попадают под "все" -- решает main.

import { Device, isReadyState } from '../adb/types/Device';
import { DeviceTagStore } from '../deviceTags/DeviceTagStore';

export function filterReadyDevicesByTag(devices: Device[], deviceTags: DeviceTagStore, tag?: string): Device[] {
  const ready = devices.filter((d) => isReadyState(d.state));
  if (!tag) return ready;
  const tagsBySerial = deviceTags.list();
  return ready.filter((d) => (tagsBySerial[d.serial] ?? []).includes(tag));
}
