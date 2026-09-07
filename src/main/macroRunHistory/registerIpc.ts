// Журнал запусков макросов -- см. MacroRunHistoryStore. Наполнение
// (record) происходит в macros/registerIpc.ts (macros:run/macros:runOnAll),
// этот файл -- только чтение/очистка уже накопленного.

import { ipcMain } from 'electron';
import { IpcContext } from '../ipcContext';

export function registerMacroRunHistoryIpc(ctx: IpcContext): void {
  ipcMain.handle('macroRunHistory:list', () => ctx.macroRunHistory.list());
  ipcMain.handle('macroRunHistory:clear', () => ctx.macroRunHistory.clear());
}
