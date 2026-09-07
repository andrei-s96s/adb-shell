// Снапшоты устройства — все пользовательские приложения с runtime-
// разрешениями в один .zip, восстановление на любом устройстве.

import { ipcMain, shell } from 'electron';
import { IpcContext } from '../ipcContext';

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
}
