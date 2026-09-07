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
    (_e, name: string, rawText: string, autorunOnConnect: boolean, abortOnFirstFailure: boolean, hotkeyAccelerator?: string) => {
      const updated = macroStore.add(name, rawText, autorunOnConnect, abortOnFirstFailure, hotkeyAccelerator);
      ctx.applyMacroHotkeys();
      return updated;
    }
  );
  ipcMain.handle(
    'macros:update',
    (
      _e,
      id: string,
      name: string,
      rawText: string,
      autorunOnConnect: boolean,
      abortOnFirstFailure: boolean,
      hotkeyAccelerator?: string
    ) => {
      const updated = macroStore.update(id, name, rawText, autorunOnConnect, abortOnFirstFailure, hotkeyAccelerator);
      ctx.applyMacroHotkeys();
      return updated;
    }
  );
  ipcMain.handle('macros:remove', (_e, id: string) => {
    const updated = macroStore.remove(id);
    ctx.applyMacroHotkeys();
    return updated;
  });
  // Теги живут прямо на Macro (не отдельным словарём "путь -> теги", как
  // ApkTagStore) -- список макросов уже возвращает их без дополнительного
  // запроса, addTag/removeTag нужны только для мутации.
  ipcMain.handle('macros:addTag', (_e, id: string, tag: string) => macroStore.addTag(id, tag));
  ipcMain.handle('macros:removeTag', (_e, id: string, tag: string) => macroStore.removeTag(id, tag));
  // Какие аккселераторы макросов реально зарегистрированы ПРЯМО СЕЙЧАС --
  // macros.ts сверяет с этим список, чтобы пометить макрос, чей хоткей
  // задан, но не активен (занят скриншот-хоткеем/другим макросом/ОС, или у
  // макроса есть переменные ${ИМЯ}, см. applyMacroHotkeys в main.ts).
  ipcMain.handle('macros:activeHotkeys', () => ctx.activeMacroHotkeyAccelerators());
  // Выполнение -- runId генерирует renderer (macros.ts/renderer.ts/
  // commandPalette.ts) ДО вызова, а не main после, потому что renderer
  // должен знать его заранее, чтобы сопоставлять с ним приходящие
  // 'macros:stepResult' события, пока сам run() ещё не завершился и не
  // вернул финальный ответ на invoke.
  ipcMain.handle(
    'macros:run',
    (event: IpcMainInvokeEvent, macroId: string, serial: string, variables: Record<string, string>, runId: string) => {
      const macro = macroStore.get(macroId);
      if (!macro) throw new Error('Макрос не найден');
      return runMacro(macro, serial, ctx.adb, variables, (index, total, result) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('macros:stepResult', runId, macroId, index, total, result);
        }
      });
    }
  );
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
    const updated = macroStore.importJSON(raw);
    ctx.applyMacroHotkeys(); // импортированные макросы могут нести свой hotkeyAccelerator
    return updated;
  });
}
