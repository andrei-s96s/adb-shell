// Файлы устройства — навигация, push/pull, создание папок, удаление.

import { ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import { IpcContext } from '../ipcContext';
import { showSaveDialogFor, showOpenDialogFor } from '../util/dialogs';
import { t } from '../i18n';

export function registerFilesIpc(ctx: IpcContext): void {
  ipcMain.handle('adb:listDirectory', (_e, serial: string, dirPath: string) => ctx.adb.listDirectory(serial, dirPath));
  ipcMain.handle('adb:makeDirectory', (_e, serial: string, dirPath: string) => ctx.adb.makeDirectory(serial, dirPath));
  ipcMain.handle('adb:removeRemote', (_e, serial: string, targetPath: string, recursive: boolean) =>
    ctx.adb.removeRemote(serial, targetPath, recursive)
  );
  // push(localPath) приходит либо из диалога выбора файла, либо готовым
  // абсолютным путём с drag&drop (webUtils.getPathForFile, см. preload.ts) --
  // сам push ничего не открывает сам. pull, наоборот, всегда спрашивает
  // "куда сохранить" через диалог здесь же (renderer выбора пути не видит).
  ipcMain.handle('adb:push', (_e, serial: string, localPath: string, remotePath: string) => ctx.adb.push(serial, localPath, remotePath));
  ipcMain.handle('dialog:selectFileToPush', async (event: IpcMainInvokeEvent) => {
    const result = await showOpenDialogFor(event, { title: t('Выберите файл для отправки на устройство'), properties: ['openFile' as const] });
    return result.canceled || result.filePaths.length === 0 ? undefined : result.filePaths[0];
  });
  ipcMain.handle('adb:pullToChosenPath', async (event: IpcMainInvokeEvent, serial: string, remotePath: string, suggestedName: string) => {
    const result = await showSaveDialogFor(event, { title: t('Сохранить как'), defaultPath: suggestedName });
    if (result.canceled || !result.filePath) return false;
    await ctx.adb.pull(serial, remotePath, result.filePath);
    shell.showItemInFolder(result.filePath);
    return true;
  });
}
