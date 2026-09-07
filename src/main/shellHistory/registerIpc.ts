// Shell-раннер (adb shell/сырые adb-команды) и его персистентная история +
// избранное — одна и та же вкладка (shellScreen.ts) использует оба.

import { ipcMain } from 'electron';
import { IpcContext } from '../ipcContext';

export function registerShellIpc(ctx: IpcContext): void {
  ipcMain.handle('adb:shell', (_e, serial: string, command: string) => ctx.adb.shell(serial, command));
  ipcMain.handle('adb:runRaw', (_e, serial: string, argsLine: string) => ctx.adb.runRaw(serial, argsLine));
  // Прерывает зависшую shell()/runRaw() -- обе намеренно без таймаута (см.
  // комментарий в AdbService.ts), поэтому единственный выход из реального
  // зависания раньше был перезапуск всего приложения.
  ipcMain.handle('adb:killShell', (_e, serial: string) => ctx.adb.killShell(serial));

  const { shellHistory } = ctx;
  ipcMain.handle('shellHistory:list', () => shellHistory.list());
  ipcMain.handle('shellHistory:record', (_e, text: string) => shellHistory.record(text));
  ipcMain.handle('shellHistory:favorite', (_e, text: string) => shellHistory.favorite(text));
  ipcMain.handle('shellHistory:toggleFavorite', (_e, id: string) => shellHistory.toggleFavorite(id));
  ipcMain.handle('shellHistory:remove', (_e, id: string) => shellHistory.remove(id));
  ipcMain.handle('shellHistory:clear', () => shellHistory.clear());
}
