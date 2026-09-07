// Intent/deep-link тестер + сохранённые пресеты.

import { ipcMain } from 'electron';
import { IpcContext } from '../ipcContext';

export function registerIntentPresetsIpc(ctx: IpcContext): void {
  ipcMain.handle('adb:openDeepLink', (_e, serial: string, uri: string) => ctx.adb.openDeepLink(serial, uri));
  ipcMain.handle('intentPresets:list', () => ctx.intentPresets.list());
  ipcMain.handle('intentPresets:add', (_e, name: string, uri: string) => ctx.intentPresets.add(name, uri));
  ipcMain.handle('intentPresets:remove', (_e, id: string) => ctx.intentPresets.remove(id));
}
