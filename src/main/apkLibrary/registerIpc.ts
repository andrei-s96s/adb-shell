// Библиотека APK — локальный каталог с .apk, доступный и без подключённого
// устройства (тот же класс требования, что уже привёл к фиксу "нельзя
// работать с приложениями без устройства": библиотеку тоже можно
// смотреть/пополнять/проверять на обновления без adb), плюс произвольные
// теги для файлов.

import { ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import { IpcContext } from '../ipcContext';
import { ApkLibraryService } from './ApkLibraryService';
import { isReadyState, displayName } from '../adb/types/Device';
import { ApkFile } from '../adb/types/ApkFile';
import { FDroidUpdateInfo } from '../adb/types/FDroidUpdateInfo';
import { showOpenDialogFor } from '../util/dialogs';

export function registerApkLibraryIpc(ctx: IpcContext): void {
  const { apkLibrary, apkTags } = ctx;

  ipcMain.handle('apkLibrary:list', () => apkLibrary.list());
  ipcMain.handle('apkLibrary:getDirectory', () => apkLibrary.getDirectory());
  ipcMain.handle('apkLibrary:chooseDirectory', async (event: IpcMainInvokeEvent) => {
    const result = await showOpenDialogFor(event, {
      title: 'Выберите папку для библиотеки APK',
      properties: ['openDirectory' as const, 'createDirectory' as const],
      defaultPath: apkLibrary.getDirectory(),
    });
    if (result.canceled || result.filePaths.length === 0) return apkLibrary.getDirectory();
    apkLibrary.setDirectory(result.filePaths[0]);
    return apkLibrary.getDirectory();
  });
  ipcMain.handle('apkLibrary:addFiles', async (event: IpcMainInvokeEvent) => {
    const result = await showOpenDialogFor(event, {
      title: 'Добавить APK в библиотеку',
      properties: ['openFile' as const, 'multiSelections' as const],
      filters: [{ name: 'Android package', extensions: ['apk'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return apkLibrary.list();
    apkLibrary.importFiles(result.filePaths);
    return apkLibrary.list();
  });
  // Импорт готовыми путями -- для drag&drop прямо в окно библиотеки (пути уже
  // известны через webUtils.getPathForFile в renderer, диалог не нужен),
  // в отличие от apkLibrary:addFiles выше (кнопка -> диалог выбора файла).
  ipcMain.handle('apkLibrary:importPaths', (_e, paths: string[]) => {
    apkLibrary.importFiles(paths.filter((p) => p.toLowerCase().endsWith('.apk')));
    return apkLibrary.list();
  });
  ipcMain.handle('apkLibrary:inspect', (_e, apkPath: string) => ApkLibraryService.inspect(apkPath));
  ipcMain.handle('apkLibrary:getIcon', async (_e, apkPath: string) => {
    const icon = await apkLibrary.extractIcon(apkPath);
    return icon ? `data:${icon.mimeType};base64,${icon.data.toString('base64')}` : undefined;
  });
  ipcMain.handle('apkLibrary:deleteFile', (_e, filePath: string) => apkLibrary.deleteFile(filePath));
  ipcMain.handle('apkLibrary:revealInFileManager', () => shell.openPath(apkLibrary.getDirectory()));
  ipcMain.handle('apkLibrary:downloadFromUrl', (event: IpcMainInvokeEvent, url: string, filename?: string) =>
    apkLibrary.downloadFromUrl(url, filename, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send('apkLibrary:downloadProgress', progress);
    })
  );
  ipcMain.handle('apkLibrary:checkFDroidUpdates', () => apkLibrary.checkFDroidUpdates());
  ipcMain.handle('apkLibrary:downloadFDroidUpdate', (_e, file: ApkFile, update: FDroidUpdateInfo) =>
    apkLibrary.downloadFDroidUpdate(file, update)
  );
  // Установка на устройство переиспользует adb:install (см. apps/registerIpc.ts);
  // здесь — только "поставить на все готовые сразу", специфичное для библиотеки.
  ipcMain.handle('apkLibrary:installToAllDevices', async (_e, apkPath: string) => {
    const devices = (await ctx.adb.listDevices()).filter((d) => isReadyState(d.state));
    if (devices.length === 0) {
      return { successCount: 0, total: 0, failures: [] as string[] };
    }
    const failures: string[] = [];
    let successCount = 0;
    for (const device of devices) {
      try {
        await ctx.adb.install(device.serial, apkPath);
        successCount += 1;
      } catch (error) {
        failures.push(`${displayName(device)}: ${(error as Error).message}`);
      }
    }
    return { successCount, total: devices.length, failures };
  });

  // Теги файлов библиотеки APK -- по полному пути на диске (файлы не
  // хранят метаданные сами по себе).
  ipcMain.handle('apkLibrary:tagsList', () => apkTags.list());
  ipcMain.handle('apkLibrary:addTag', (_e, filePath: string, tag: string) => apkTags.addTag(filePath, tag));
  ipcMain.handle('apkLibrary:removeTag', (_e, filePath: string, tag: string) => apkTags.removeTag(filePath, tag));
}
