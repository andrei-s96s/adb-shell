import { adbApi, el, errorMessage } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';

let inputEl: HTMLInputElement;
let logEl: HTMLDivElement;
let runBtn: HTMLButtonElement;

export function initShellScreen(): void {
  inputEl = el<HTMLInputElement>('shell-input');
  logEl = el<HTMLDivElement>('shell-log');
  runBtn = el<HTMLButtonElement>('shell-run');

  runBtn.addEventListener('click', () => void runCommand());
  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void runCommand();
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
    const output = await adbApi.shell(serial, command);
    appendLine(output.length > 0 ? output : '(нет вывода)', 'shell-out');
  } catch (error) {
    appendLine(`Ошибка: ${errorMessage(error)}`, 'shell-err');
  } finally {
    runBtn.disabled = false;
  }
}

function appendLine(text: string, className: string): void {
  const pre = document.createElement('pre');
  pre.className = className;
  pre.textContent = text;
  logEl.appendChild(pre);
  logEl.scrollTop = logEl.scrollHeight;
}
