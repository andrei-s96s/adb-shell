// dialog.showSaveDialog()/showOpenDialog(), привязанный к окну, из которого
// пришло IPC-событие -- этот же паттерн (BrowserWindow.fromWebContents(...)
// ? dialog.showXDialog(win, options) : dialog.showXDialog(options),
// fallback на модальный-без-родителя вариант, когда fromWebContents не
// нашёл окно) был дословно продублирован 16 раз по всему main.ts.

import { BrowserWindow, dialog, IpcMainInvokeEvent, OpenDialogOptions, OpenDialogReturnValue, SaveDialogOptions, SaveDialogReturnValue } from 'electron';

export function showSaveDialogFor(event: IpcMainInvokeEvent, options: SaveDialogOptions): Promise<SaveDialogReturnValue> {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options);
}

export function showOpenDialogFor(event: IpcMainInvokeEvent, options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
}
