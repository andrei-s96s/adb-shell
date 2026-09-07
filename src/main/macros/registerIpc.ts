// Макросы -- именованные последовательности adb-команд.

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import * as fsPromises from 'node:fs/promises';
import { IpcContext } from '../ipcContext';
import { runMacro } from './MacroRunner';
import { showSaveDialogFor, showOpenDialogFor } from '../util/dialogs';

export function registerMacrosIpc(ctx: IpcContext): void {
  const { macroStore } = ctx;

  ipcMain.handle('macros:list', () => macroStore.list());
  ipcMain.handle(
    'macros:add',
    (_e, name: string, rawText: string, autorunOnConnect: boolean, abortOnFirstFailure: boolean) =>
      macroStore.add(name, rawText, autorunOnConnect, abortOnFirstFailure)
  );
  ipcMain.handle(
    'macros:update',
    (_e, id: string, name: string, rawText: string, autorunOnConnect: boolean, abortOnFirstFailure: boolean) =>
      macroStore.update(id, name, rawText, autorunOnConnect, abortOnFirstFailure)
  );
  ipcMain.handle('macros:remove', (_e, id: string) => macroStore.remove(id));
  // Выполнение -- см. MacroRunner.ts про то, почему результаты шагов не
  // транслируются построчно, а возвращаются одним ответом по завершении.
  ipcMain.handle('macros:run', (_e, macroId: string, serial: string, variables: Record<string, string>) => {
    const macro = macroStore.get(macroId);
    if (!macro) throw new Error('Макрос не найден');
    return runMacro(macro, serial, ctx.adb, variables);
  });
  ipcMain.handle('macros:export', async (event: IpcMainInvokeEvent) => {
    const result = await showSaveDialogFor(event, {
      title: 'Экспорт макросов',
      defaultPath: 'adbshell-macros.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fsPromises.writeFile(result.filePath, macroStore.exportJSON(), 'utf8');
    return true;
  });
  ipcMain.handle('macros:import', async (event: IpcMainInvokeEvent) => {
    const result = await showOpenDialogFor(event, {
      title: 'Импорт макросов',
      properties: ['openFile' as const],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return macroStore.list();
    const raw = await fsPromises.readFile(result.filePaths[0], 'utf8');
    return macroStore.importJSON(raw);
  });
}
