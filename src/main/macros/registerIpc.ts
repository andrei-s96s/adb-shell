// Макросы -- именованные последовательности adb-команд.

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import * as fsPromises from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { IpcContext } from '../ipcContext';
import { runMacro } from './MacroRunner';
import { parseSteps } from './macrosLogic';
import { MacroStep } from '../adb/types/Macro';
import { displayName } from '../adb/types/Device';
import { filterReadyDevicesByTag } from '../util/deviceBatchTarget';
import { runMacroOnDevices } from './runMacroOnDevices';
import { showSaveDialogFor, showOpenDialogFor } from '../util/dialogs';

export function registerMacrosIpc(ctx: IpcContext): void {
  const { macroStore } = ctx;

  ipcMain.handle('macros:list', () => macroStore.list());
  ipcMain.handle(
    'macros:add',
    (
      _e,
      name: string,
      steps: MacroStep[],
      autorunOnConnect: boolean,
      abortOnFirstFailure: boolean,
      hotkeyAccelerator?: string,
      scheduleIntervalMinutes?: number
    ) => {
      const updated = macroStore.add(name, steps, autorunOnConnect, abortOnFirstFailure, hotkeyAccelerator, scheduleIntervalMinutes);
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
      steps: MacroStep[],
      autorunOnConnect: boolean,
      abortOnFirstFailure: boolean,
      hotkeyAccelerator?: string,
      scheduleIntervalMinutes?: number
    ) => {
      const updated = macroStore.update(
        id,
        name,
        steps,
        autorunOnConnect,
        abortOnFirstFailure,
        hotkeyAccelerator,
        scheduleIntervalMinutes
      );
      ctx.applyMacroHotkeys();
      return updated;
    }
  );
  // Разбор вставленного скрипта в шаги -- вызывается редактором макроса
  // (structured-editor в macros.ts) при клике "Вставить скрипт…", отдельно
  // от macros:add/update: та же parseSteps(), что раньше вызывалась внутри
  // add/update неявно, но теперь редактор сам решает, куда вставить
  // получившиеся шаги в уже существующий структурный список (в конец,
  // после ручных правок и т.п.), а не просто заменяет им весь макрос.
  ipcMain.handle('macros:parseScript', (_e, rawText: string) => parseSteps(rawText, () => randomUUID()));
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
    async (event: IpcMainInvokeEvent, macroId: string, serial: string, variables: Record<string, string>, runId: string) => {
      const macro = macroStore.get(macroId);
      if (!macro) throw new Error('Макрос не найден');
      const startedAtMs = Date.now();
      const outcome = await runMacro(macro, serial, ctx.adb, variables, (index, total, result) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('macros:stepResult', runId, macroId, index, total, result);
        }
      });
      // Лейбл устройства -- best-effort, не должен ронять сам запуск: если
      // adb devices -l недоступен ровно в этот момент, в истории останется
      // просто serial вместо модели, не хуже.
      let deviceLabel = serial;
      try {
        const device = (await ctx.adb.listDevices()).find((d) => d.serial === serial);
        if (device) deviceLabel = displayName(device);
      } catch {
        // Не критично -- см. выше.
      }
      ctx.macroRunHistory.record(macro, serial, deviceLabel, startedAtMs, outcome.completedFully, outcome.results);
      return outcome;
    }
  );
  // Запуск на всех готовых устройствах разом -- сама раскладка по устройствам
  // (runMacroOnDevices.ts) переиспользуется и планировщиком периодических
  // макросов в main.ts. Без пошагового стриминга в UI (в отличие от
  // macros:run) -- на N устройств разом это была бы уже другая, более
  // сложная модель прогресса; здесь достаточно итогового результата на
  // устройство, как и у прочих "на все" операций (adb:screenshotAllDevices,
  // apkLibrary:installToAllDevices).
  ipcMain.handle('macros:runOnAll', async (_e, macroId: string, variables: Record<string, string>, tag?: string) => {
    const macro = macroStore.get(macroId);
    if (!macro) throw new Error('Макрос не найден');
    const devices = filterReadyDevicesByTag(await ctx.adb.listDevices(), ctx.deviceTags, tag);
    if (devices.length === 0) return { successCount: 0, total: 0, failures: [] as string[] };
    return runMacroOnDevices(macro, devices, ctx.adb, variables, ctx.macroRunHistory);
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
    const updated = macroStore.importJSON(raw);
    ctx.applyMacroHotkeys(); // импортированные макросы могут нести свой hotkeyAccelerator
    return updated;
  });
}
