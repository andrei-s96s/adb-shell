// Logcat — живой стрим, строки уходят в renderer как события 'logcat:line',
// а не через ответ на invoke (сессия долгоживущая, невозможно вернуть
// одно значение).

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IpcContext } from '../ipcContext';
import { LogcatSession } from './LogcatSession';
import { DemoLogcatSession } from './demo/DemoLogcatSession';
import { DEMO_SERIAL } from './demo/demoData';

export function registerLogcatIpc(ctx: IpcContext): void {
  const { logcatSessions } = ctx;

  ipcMain.handle('adb:startLogcat', (event: IpcMainInvokeEvent, serial: string) => {
    logcatSessions.get(serial)?.stop();
    const session = serial === DEMO_SERIAL ? new DemoLogcatSession(ctx.adb.adbPath, serial) : new LogcatSession(ctx.adb.adbPath, serial);
    logcatSessions.set(serial, session);
    session.start(
      (line) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('logcat:line', serial, line);
        }
      },
      () => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('logcat:ended', serial);
        }
      }
    );
  });
  ipcMain.handle('adb:stopLogcat', (_e, serial: string) => {
    logcatSessions.get(serial)?.stop();
    logcatSessions.delete(serial);
  });
  ipcMain.handle('adb:clearLogcatBuffer', (_e, serial: string) => {
    // Работает и без активного стрима — просто спавнит `adb logcat -c` разово.
    const session = logcatSessions.get(serial) ?? (serial === DEMO_SERIAL ? new DemoLogcatSession(ctx.adb.adbPath, serial) : new LogcatSession(ctx.adb.adbPath, serial));
    session.clearDeviceBuffer();
  });
}
