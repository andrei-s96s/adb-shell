import { adbApi, el, errorMessage } from '../api.js';
import type { LogLevel, LogLine } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';
import { parseLogLine, levelLabel } from '../logLineParser.js';
import { openCrashTracesModal } from './crashTraces.js';

const MAX_LINES = 5000;

let logEl: HTMLDivElement;
let statusEl: HTMLDivElement;
let startBtn: HTMLButtonElement;
let stopBtn: HTMLButtonElement;
let clearBtn: HTMLButtonElement;
let filterInput: HTMLInputElement;
let levelSelect: HTMLSelectElement;
let autoscrollCheckbox: HTMLInputElement;

let allLines: LogLine[] = [];
let isRunning = false;
let unsubscribe: (() => void) | undefined;
let activeSerial: string | undefined;

export function initLogcatScreen(): void {
  logEl = el<HTMLDivElement>('logcat-log');
  statusEl = el<HTMLDivElement>('logcat-status');
  startBtn = el<HTMLButtonElement>('logcat-start');
  stopBtn = el<HTMLButtonElement>('logcat-stop');
  clearBtn = el<HTMLButtonElement>('logcat-clear');
  filterInput = el<HTMLInputElement>('logcat-filter');
  levelSelect = el<HTMLSelectElement>('logcat-level');
  autoscrollCheckbox = el<HTMLInputElement>('logcat-autoscroll');

  startBtn.addEventListener('click', () => void start());
  stopBtn.addEventListener('click', () => void stop());
  clearBtn.addEventListener('click', () => void clearBuffer());
  filterInput.addEventListener('input', renderLog);
  levelSelect.addEventListener('change', renderLog);
  el<HTMLButtonElement>('logcat-crashes').addEventListener('click', () => {
    const serial = getCurrentSerial();
    if (serial) openCrashTracesModal(serial);
  });

  unsubscribe = adbApi.onLogcatLine((serial, rawLine) => {
    if (serial !== activeSerial) return;
    const parsed = parseLogLine(rawLine);
    if (!parsed) return;
    allLines.push(parsed);
    if (allLines.length > MAX_LINES) allLines.splice(0, allLines.length - MAX_LINES);
    renderLog();
  });

  onDeviceChanged((serial) => {
    void stop();
    allLines = [];
    renderLog();
    statusEl.textContent = serial ? '' : 'Нет подключённого устройства — выберите устройство слева';
    updateButtons();
  });

  updateButtons();
}

async function start(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial) return;
  statusEl.textContent = 'Запуск…';
  try {
    activeSerial = serial;
    await adbApi.startLogcat(serial);
    isRunning = true;
    statusEl.textContent = '';
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
  updateButtons();
}

async function stop(): Promise<void> {
  if (activeSerial) {
    try {
      await adbApi.stopLogcat(activeSerial);
    } catch {
      /* игнорируем — устройство могло уже отключиться */
    }
  }
  isRunning = false;
  updateButtons();
}

async function clearBuffer(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial) return;
  try {
    await adbApi.clearLogcatBuffer(serial);
    allLines = [];
    renderLog();
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

function updateButtons(): void {
  startBtn.disabled = isRunning || !getCurrentSerial();
  stopBtn.disabled = !isRunning;
}

function renderLog(): void {
  const query = filterInput.value.trim().toLowerCase();
  const minLevel = Number.parseInt(levelSelect.value, 10) as LogLevel;

  const filtered = allLines.filter((line) => {
    if (line.level < minLevel) return false;
    if (!query) return true;
    return line.message.toLowerCase().includes(query) || (line.tag ?? '').toLowerCase().includes(query);
  });

  logEl.innerHTML = '';
  for (const line of filtered) {
    const row = document.createElement('div');
    row.className = `log-row log-level-${line.level}`;
    row.textContent = `${line.timestamp ?? ''} ${levelLabel(line.level)} ${line.tag ?? ''}: ${line.message}`;
    logEl.appendChild(row);
  }
  if (autoscrollCheckbox.checked) {
    logEl.scrollTop = logEl.scrollHeight;
  }
}
