import { adbApi, el, errorMessage } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';
import { openScreenshotPreview } from './screenshot.js';

let inputEl: HTMLInputElement;
let logEl: HTMLDivElement;
let runBtn: HTMLButtonElement;
let broadcastEl: HTMLInputElement;

export function initShellScreen(): void {
  inputEl = el<HTMLInputElement>('shell-input');
  logEl = el<HTMLDivElement>('shell-log');
  runBtn = el<HTMLButtonElement>('shell-run');
  broadcastEl = el<HTMLInputElement>('shell-broadcast');

  runBtn.addEventListener('click', () => void runCommand());
  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void runCommand();
  });
  el<HTMLButtonElement>('shell-screenshot').addEventListener('click', () => {
    const serial = getCurrentSerial();
    if (serial) void openScreenshotPreview(serial);
  });

  onDeviceChanged((serial) => {
    logEl.innerHTML = '';
    if (!serial) {
      appendLine('Нет подключённого устройства — выберите устройство слева', 'shell-out');
    }
  });
}

async function runCommand(): Promise<void> {
  const serial = getCurrentSerial();
  const command = inputEl.value.trim();
  if (!serial || !command) return;

  appendLine(`$ ${command}`, 'shell-cmd');
  inputEl.value = '';
  runBtn.disabled = true;
  try {
    if (broadcastEl.checked) {
      await runBroadcast(command);
    } else {
      const output = await adbApi.shell(serial, command);
      appendLine(output.length > 0 ? output : '(нет вывода)', 'shell-out');
    }
  } catch (error) {
    appendLine(`Ошибка: ${errorMessage(error)}`, 'shell-err');
  } finally {
    runBtn.disabled = false;
  }
}

/** Порт runBroadcast(_:) из Sources/AdbShell/Views/ShellRunnerView.swift --
 * прогоняет команду по очереди (не параллельно) на всех подключённых и
 * готовых устройствах, каждая запись в истории со своим префиксом. */
async function runBroadcast(command: string): Promise<void> {
  const devices = (await adbApi.listDevices()).filter((d) => d.state === 'device');
  if (devices.length === 0) {
    appendLine('Нет подключённых устройств для broadcast', 'shell-err');
    return;
  }
  for (const device of devices) {
    const label = device.model ? device.model.replace(/_/g, ' ') : device.serial;
    try {
      const output = await adbApi.shell(device.serial, command);
      appendLine(`[${label}] ${command}`, 'shell-cmd');
      appendLine(output.length > 0 ? output : '(нет вывода)', 'shell-out');
    } catch (error) {
      appendLine(`[${label}] ${command}`, 'shell-cmd');
      appendLine(errorMessage(error), 'shell-err');
    }
  }
}

function appendLine(text: string, className: string): void {
  const pre = document.createElement('pre');
  pre.className = className;
  pre.textContent = text;
  logEl.appendChild(pre);
  logEl.scrollTop = logEl.scrollHeight;
}
