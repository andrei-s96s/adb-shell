// Приложения — список/детали/иконки, install/uninstall и разрешения,
// F-Droid обновления, пакетные операции, наборы приложений (export/import
// с runtime-разрешениями), сравнение установленных пакетов двух устройств.

import { ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fsPromises from 'node:fs/promises';
import { IpcContext } from '../ipcContext';
import { DEMO_SERIAL, DEMO_APPS } from '../adb/demo/demoData';
import { demoIconDataUri } from '../adb/demo/demoIcons';
import { FDroidUpdateInfo, fdroidDownloadUrl } from '../adb/types/FDroidUpdateInfo';
import { checkFDroidUpdate } from '../apkLibrary/FDroidUpdateChecker';
import { downloadWithProgress } from '../util/download';
import { mapWithConcurrency } from '../util/concurrency';
import { showSaveDialogFor, showOpenDialogFor } from '../util/dialogs';
import { timestampForFilename } from '../util/timestamp';
import { exportBundle, importBundle } from '../appBundles/AppBundleService';
import { comparePackages } from '../adb/parsers/PackageDiff';

export function registerAppsIpc(ctx: IpcContext): void {
  ipcMain.handle('adb:listApps', (_e, serial: string) => ctx.adb.listApps(serial));
  // Реальные иконки приложений (aapt2 + adm-zip) -- лениво, по одному
  // запросу на строку списка, см. appIcons/AppIconService.ts.
  ipcMain.handle('icons:get', async (_e, serial: string, packageName: string) => {
    // Демо-устройству настоящих .apk не пробуем -- pull дал бы файл-
    // заглушку, на которой aapt2 закономерно не смог бы ничего прочитать
    // (тот же итог, пустой плейсхолдер, но лишний спавн процесса и запись
    // временного файла впустую). Вместо этого -- сразу сгенерированная
    // цветная иконка с буквой (demoIcons.ts).
    if (serial === DEMO_SERIAL) {
      const profile = DEMO_APPS.find((a) => a.packageName === packageName);
      return profile ? demoIconDataUri(profile.label, profile.packageName) : undefined;
    }
    const icon = await ctx.appIcons.fetch(serial, packageName, ctx.adb);
    return icon ? `data:${icon.mimeType};base64,${icon.data.toString('base64')}` : undefined;
  });
  ipcMain.handle('adb:appDetail', (_e, serial: string, packageName: string) => ctx.adb.appDetail(serial, packageName));
  // Сверка установленных пользовательских приложений с F-Droid: один
  // bulk-дамп versionCode со всего устройства + сетевые запросы с
  // ограничением параллелизма (тот же mapWithConcurrency, что и у
  // библиотеки APK в ApkLibraryService.checkFDroidUpdates). Ничего не
  // ставит сама -- только сообщает о найденном обновлении, установка
  // отдельным вызовом ниже.
  ipcMain.handle('apps:checkFDroidUpdates', async (_e, serial: string) => {
    const [apps, versionCodes] = await Promise.all([
      ctx.adb.listApps(serial),
      ctx.adb.installedVersionCodes(serial).catch((): Record<string, number> => ({})),
    ]);
    const candidates = apps.filter((a) => !a.isSystem && versionCodes[a.packageName] !== undefined);
    const results: Record<string, FDroidUpdateInfo> = {};
    await mapWithConcurrency(candidates, 4, async (app) => {
      const update = await checkFDroidUpdate(app.packageName, versionCodes[app.packageName]).catch(() => undefined);
      if (update) results[app.packageName] = update;
    });
    return results;
  });
  // Скачивает найденную версию с F-Droid во временный файл и ставит на то
  // же устройство -- предложение, не автодействие, выполняется только по
  // явному нажатию кнопки в детали приложения.
  ipcMain.handle('apps:installFDroidUpdate', async (_e, serial: string, packageName: string, latestVersionCode: number) => {
    const tmpPath = path.join(os.tmpdir(), `fdroid-${packageName}-${latestVersionCode}.apk`);
    try {
      // Потоково в файл, не fetch().arrayBuffer() целиком в память -- тот же
      // повод, что и в ApkLibraryService.downloadFDroidUpdate().
      await downloadWithProgress(fdroidDownloadUrl({ packageName, latestVersionCode, installedVersionCode: 0 }), tmpPath);
      await ctx.adb.install(serial, tmpPath);
    } finally {
      await fsPromises.rm(tmpPath, { force: true });
    }
  });
  ipcMain.handle('adb:install', (_e, serial: string, apkPath: string) => ctx.adb.install(serial, apkPath));
  ipcMain.handle('adb:uninstall', (_e, serial: string, packageName: string) => ctx.adb.uninstall(serial, packageName));
  ipcMain.handle('adb:forceStop', (_e, serial: string, packageName: string) => ctx.adb.forceStop(serial, packageName));
  ipcMain.handle('adb:clearData', (_e, serial: string, packageName: string) => ctx.adb.clearData(serial, packageName));
  ipcMain.handle('adb:setEnabled', (_e, serial: string, packageName: string, enabled: boolean) =>
    ctx.adb.setEnabled(serial, packageName, enabled)
  );
  ipcMain.handle('adb:grantPermission', (_e, serial: string, packageName: string, permission: string) =>
    ctx.adb.grantPermission(serial, packageName, permission)
  );
  ipcMain.handle('adb:revokePermission', (_e, serial: string, packageName: string, permission: string) =>
    ctx.adb.revokePermission(serial, packageName, permission)
  );
  // AdbService.install() существовал и был проброшен через IPC, но нигде в
  // renderer не было способа выбрать локальный файл для установки — кнопка
  // без диалога выбора файла бесполезна. Диалог обязан открываться из main
  // (renderer в sandboxed contextIsolation-режиме доступа к нативным
  // диалогам не имеет).
  ipcMain.handle('dialog:selectApk', async (event: IpcMainInvokeEvent) => {
    const result = await showOpenDialogFor(event, {
      title: 'Выберите APK',
      properties: ['openFile' as const],
      filters: [{ name: 'Android package', extensions: ['apk'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return undefined;
    return result.filePaths[0];
  });
  ipcMain.handle('dialog:selectApks', async (event: IpcMainInvokeEvent) => {
    const result = await showOpenDialogFor(event, {
      title: 'Выберите APK (можно несколько)',
      properties: ['openFile' as const, 'multiSelections' as const],
      filters: [{ name: 'Android package', extensions: ['apk'] }],
    });
    return result.canceled ? [] : result.filePaths;
  });

  // Пакетное удаление/установка (мультивыбор в духе Finder, apps.ts) --
  // последовательно, не параллельно, тот же порядок, что и в оригинале.
  ipcMain.handle('apps:deleteSelected', async (_e, serial: string, packages: string[]) => {
    const sorted = [...packages].sort();
    const results: { packageName: string; success: boolean; message: string }[] = [];
    for (const pkg of sorted) {
      try {
        await ctx.adb.uninstall(serial, pkg);
        results.push({ packageName: pkg, success: true, message: 'OK' });
      } catch (error) {
        // Продолжаем остальные -- одна неудача не должна прерывать пакет.
        results.push({ packageName: pkg, success: false, message: (error as Error).message });
      }
    }
    return results;
  });
  ipcMain.handle('apps:installBatch', async (_e, serial: string, apkPaths: string[]) => {
    const results: { apkPath: string; success: boolean; message: string }[] = [];
    for (const apkPath of apkPaths) {
      try {
        const output = await ctx.adb.install(serial, apkPath);
        results.push({ apkPath, success: true, message: output });
      } catch (error) {
        results.push({ apkPath, success: false, message: (error as Error).message });
      }
    }
    return results;
  });

  // Наборы приложений (экспорт/импорт с runtime-разрешениями) — см.
  // AppBundleService.ts. Снапшоты устройства — deviceSnapshots/registerIpc.ts.
  ipcMain.handle('apps:exportSelected', async (event: IpcMainInvokeEvent, serial: string, packages: string[]) => {
    const result = await showSaveDialogFor(event, {
      title: 'Экспорт набора приложений',
      defaultPath: `apps-export-${timestampForFilename(new Date())}.zip`,
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePath) return undefined;
    const outcome = await exportBundle(packages, serial, undefined, result.filePath, ctx.adb);
    if (outcome.entryCount > 0) shell.showItemInFolder(result.filePath);
    return outcome;
  });
  ipcMain.handle('apps:importBundle', async (event: IpcMainInvokeEvent, serial: string) => {
    const result = await showOpenDialogFor(event, {
      title: 'Импорт набора приложений',
      properties: ['openFile' as const],
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return undefined;
    return importBundle(result.filePaths[0], serial, ctx.adb);
  });

  // Экспорт APK установленного приложения обратно на компьютер (pm path + pull).
  ipcMain.handle('apps:exportApk', async (event: IpcMainInvokeEvent, serial: string, packageName: string) => {
    const paths = await ctx.adb.apkPaths(serial, packageName);
    const basePath = paths.find((p) => p.endsWith('base.apk')) ?? paths[0];
    if (!basePath) return false;
    const result = await showSaveDialogFor(event, {
      title: 'Экспортировать APK',
      defaultPath: `${packageName}.apk`,
      filters: [{ name: 'APK', extensions: ['apk'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await ctx.adb.pull(serial, basePath, result.filePath);
    shell.showItemInFolder(result.filePath);
    return true;
  });

  // Сравнение установленных пакетов двух устройств -- сама выборка списков
  // и diff выполняются здесь же, renderer получает уже готовый результат.
  ipcMain.handle('adb:comparePackages', async (_e, serialA: string, serialB: string) => {
    const [appsA, appsB] = await Promise.all([ctx.adb.listApps(serialA), ctx.adb.listApps(serialB)]);
    return comparePackages(
      appsA.map((a) => a.packageName),
      appsB.map((a) => a.packageName)
    );
  });
}
