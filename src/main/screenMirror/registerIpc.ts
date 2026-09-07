// Зеркалирование экрана через scrcpy -- своё окно рисует сам scrcpy,
// здесь только запуск процесса и отслеживание, какие serial сейчас
// зеркалятся (push-событие 'mirror:stopped', когда окно закрыто -- в т.ч.
// если пользователь закрыл его сам, не из ADB Shell).

import { ipcMain, IpcMainInvokeEvent, screen } from 'electron';
import { IpcContext } from '../ipcContext';
import { MirrorError } from './ScreenMirrorService';
import { DEMO_SERIAL } from '../adb/demo/demoData';
import { showSaveDialogFor } from '../util/dialogs';
import { timestampForFilename } from '../util/timestamp';
import { t } from '../i18n';

export function registerMirrorIpc(ctx: IpcContext): void {
  const { screenMirror } = ctx;

  ipcMain.handle('mirror:isAvailable', () => screenMirror.isAvailable());
  ipcMain.handle('mirror:runningSerials', () => screenMirror.runningSerials());
  ipcMain.handle('mirror:launch', (event: IpcMainInvokeEvent, serial: string, recordPath?: string) => {
    if (serial === DEMO_SERIAL) throw new MirrorError('Зеркалирование недоступно для демо-устройства — у него нет настоящего экрана');
    screenMirror.launch(serial, ctx.adb.adbPath, { recordPath }, (stoppedSerial) => {
      if (!event.sender.isDestroyed()) event.sender.send('mirror:stopped', stoppedSerial);
    });
  });
  ipcMain.handle('mirror:launchGrid', (event: IpcMainInvokeEvent, serials: string[]) => {
    if (serials.includes(DEMO_SERIAL)) throw new MirrorError('Зеркалирование недоступно для демо-устройства — у него нет настоящего экрана');
    const display = screen.getPrimaryDisplay();
    screenMirror.launchGrid(serials, ctx.adb.adbPath, display.workArea, (stoppedSerial) => {
      if (!event.sender.isDestroyed()) event.sender.send('mirror:stopped', stoppedSerial);
    });
  });
  ipcMain.handle('dialog:selectRecordPath', async (event: IpcMainInvokeEvent, serial: string) => {
    const result = await showSaveDialogFor(event, {
      title: t('Записать зеркалирование в файл'),
      defaultPath: `adbshell-${serial.replace(/[:/\\]/g, '-')}-${timestampForFilename(new Date())}.mp4`,
      filters: [{ name: 'MP4', extensions: ['mp4'] }],
    });
    return result.canceled ? undefined : result.filePath;
  });
}
