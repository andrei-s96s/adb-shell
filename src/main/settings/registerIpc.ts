// Настройки приложения (пороги CPU/батареи, автопроверка обновлений,
// системные приложения по умолчанию, тема, глобальный хоткей скриншота --
// один общий JSON, см. AppSettingsStore).

import { ipcMain } from 'electron';
import { IpcContext } from '../ipcContext';
import { AppSettings } from './AppSettingsStore';

export function registerSettingsIpc(ctx: IpcContext): void {
  ipcMain.handle('settings:get', () => ctx.appSettings.get());
  ipcMain.handle('settings:update', (_e, partial: Partial<AppSettings>) => {
    const updated = ctx.appSettings.update(partial);
    ctx.applyHotkeySetting();
    return updated;
  });
}
