// Снапшоты устройства — все пользовательские приложения с runtime-
// разрешениями в один .zip, восстановление на любом устройстве.

import { ipcMain, shell } from 'electron';
import { IpcContext } from '../ipcContext';
import { diffManifests, isMeaningfulDiff } from '../appBundles/appBundleLogic';

export function registerSnapshotsIpc(ctx: IpcContext): void {
  ipcMain.handle('snapshots:list', () => ctx.deviceSnapshots.list());
  ipcMain.handle('snapshots:take', async (_e, serial: string, packages: string[], deviceLabel: string) =>
    ctx.deviceSnapshots.take(packages, serial, deviceLabel, ctx.adb)
  );
  ipcMain.handle('snapshots:restore', (_e, snapshotPath: string, serial: string) =>
    ctx.deviceSnapshots.restore(snapshotPath, serial, ctx.adb)
  );
  ipcMain.handle('snapshots:delete', (_e, snapshotPath: string) => ctx.deviceSnapshots.delete(snapshotPath));
  ipcMain.handle('snapshots:reveal', (_e, snapshotPath: string) => shell.showItemInFolder(snapshotPath));
  // Сравнение двух снапшотов -- читает manifest.json из каждого, не
  // распаковывая сами apk (см. DeviceSnapshotService.readManifest()).
  ipcMain.handle('snapshots:diff', (_e, pathA: string, pathB: string) => {
    const manifestA = ctx.deviceSnapshots.readManifest(pathA);
    const manifestB = ctx.deviceSnapshots.readManifest(pathB);
    // Только реальные отличия -- renderer показывает diff, а не полный
    // список пакетов, нет смысла гонять сотни "unchanged" через IPC.
    return diffManifests(manifestA, manifestB).filter(isMeaningfulDiff);
  });
}
