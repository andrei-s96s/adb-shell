// Профили подключения (сохранённые host + автоконнект при старте).

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import * as fsPromises from 'node:fs/promises';
import { IpcContext } from '../ipcContext';
import { showSaveDialogFor, showOpenDialogFor } from '../util/dialogs';

export function registerConnectionProfilesIpc(ctx: IpcContext): void {
  const { connectionProfiles } = ctx;

  ipcMain.handle('connectionProfiles:list', () => connectionProfiles.list());
  ipcMain.handle('connectionProfiles:add', (_e, name: string, host: string) => connectionProfiles.add(name, host));
  ipcMain.handle('connectionProfiles:remove', (_e, id: string) => connectionProfiles.remove(id));
  ipcMain.handle('connectionProfiles:toggleAutoConnect', (_e, id: string) => connectionProfiles.toggleAutoConnect(id));
  ipcMain.handle('connectionProfiles:clear', () => connectionProfiles.clear());
  // Подключение по адресу конкретного профиля — переиспользует adb.connect
  // (та же нормализация host без порта, см. AdbService.connect).
  ipcMain.handle('connectionProfiles:connect', (_e, host: string) => ctx.adb.connect(host));
  // Best-effort автоподключение при старте — вызывается renderer'ом один раз
  // после первого refreshDevices(), ошибка одного профиля не мешает
  // остальным (устройство может быть выключено/недоступно).
  ipcMain.handle('connectionProfiles:autoConnect', async () => {
    const profiles = connectionProfiles.autoConnectProfiles;
    for (const profile of profiles) {
      try {
        await ctx.adb.connect(profile.host);
      } catch {
        // Устройство может быть недоступно — не должно блокировать остальные.
      }
    }
    return profiles.length;
  });
  ipcMain.handle('connectionProfiles:export', async (event: IpcMainInvokeEvent) => {
    const result = await showSaveDialogFor(event, {
      title: 'Экспорт профилей подключения',
      defaultPath: 'adbshell-profiles.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fsPromises.writeFile(result.filePath, connectionProfiles.exportJSON(), 'utf8');
    return true;
  });
  ipcMain.handle('connectionProfiles:import', async (event: IpcMainInvokeEvent) => {
    const result = await showOpenDialogFor(event, {
      title: 'Импорт профилей подключения',
      properties: ['openFile' as const],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return connectionProfiles.list();
    const raw = await fsPromises.readFile(result.filePaths[0], 'utf8');
    return connectionProfiles.importJSON(raw);
  });
}
