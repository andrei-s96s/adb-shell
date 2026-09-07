// Теги устройств -- по serial, см. DeviceTagStore.

import { ipcMain } from 'electron';
import { IpcContext } from '../ipcContext';

export function registerDeviceTagsIpc(ctx: IpcContext): void {
  ipcMain.handle('deviceTags:list', () => ctx.deviceTags.list());
  ipcMain.handle('deviceTags:addTag', (_e, serial: string, tag: string) => ctx.deviceTags.addTag(serial, tag));
  ipcMain.handle('deviceTags:removeTag', (_e, serial: string, tag: string) => ctx.deviceTags.removeTag(serial, tag));
}
