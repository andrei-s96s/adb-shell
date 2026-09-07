// Настройки приложения (пороги CPU/батареи, автопроверка обновлений,
// системные приложения по умолчанию, тема, глобальный хоткей скриншота --
// один общий JSON, см. AppSettingsStore).

import { ipcMain } from 'electron';
import { IpcContext } from '../ipcContext';
import { AppSettings } from './AppSettingsStore';
import { setLocale } from '../i18n';

export function registerSettingsIpc(ctx: IpcContext): void {
  ipcMain.handle('settings:get', () => ctx.appSettings.get());
  ipcMain.handle('settings:screenshotHotkeyActive', () => ctx.isScreenshotHotkeyActive());
  ipcMain.handle('settings:update', (_e, partial: Partial<AppSettings>) => {
    const updated = ctx.appSettings.update(partial);
    // Строки main-процесса, ещё не показанные (следующий вызов диалога,
    // следующее уведомление), подхватят новый язык сразу -- уже открытые
    // окна renderer'а всё равно требуют перезапуска (см. i18n.ts), это
    // касается только main-стороны.
    setLocale(updated.locale);
    // Порядок важен: applyMacroHotkeys() сначала снимает claim любого
    // макроса на сочетание, которое теперь зарезервировано под скриншот
    // (см. её собственный комментарий в main.ts про сверку с настроенным,
    // а не зарегистрированным значением) -- иначе applyHotkeySetting() ниже
    // мог бы зарегистрировать скриншот поверх ещё живой macro-регистрации
    // того же сочетания, а следующий за ним applyMacroHotkeys() снял бы
    // ОБА (unregister() по строке не разбирает, чей это callback).
    ctx.applyMacroHotkeys();
    ctx.applyHotkeySetting();
    return updated;
  });
}
