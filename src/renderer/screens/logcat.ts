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
let unsubscribeEnded: (() => void) | undefined;
let activeSerial: string | undefined;

// Живой стрим может отдавать десятки-сотни строк в секунду -- раньше
// каждая ОТДЕЛЬНАЯ строка синхронно вызывала renderLog() (полный
// innerHTML='' + пересборка до MAX_LINES узлов), то есть десятки полных
// ре-рендеров DOM в секунду на активном устройстве, с реальным риском
// подвисания рендерера. Новые строки теперь копятся в pendingLines и
// дописываются в DOM инкрементально (appendChild, без пересборки уже
// показанных строк) не чаще раза за кадр (requestAnimationFrame).
// renderLog() (полная пересборка) остаётся только для случаев, где меняется
// набор ВИДИМЫХ строк целиком -- смена фильтра/уровня, "Очистить",
// смена устройства.
let pendingLines: LogLine[] = [];
let flushHandle: number | undefined;

function cancelScheduledAppend(): void {
  if (flushHandle !== undefined) {
    cancelAnimationFrame(flushHandle);
    flushHandle = undefined;
  }
  pendingLines = [];
}

function matchesCurrentFilter(line: LogLine, query: string, minLevel: LogLevel): boolean {
  if (line.level < minLevel) return false;
  if (!query) return true;
  return line.message.toLowerCase().includes(query) || (line.tag ?? '').toLowerCase().includes(query);
}

function scheduleAppend(line: LogLine): void {
  pendingLines.push(line);
  if (flushHandle !== undefined) return;
  flushHandle = requestAnimationFrame(flushPendingLines);
}

function flushPendingLines(): void {
  flushHandle = undefined;
  if (pendingLines.length === 0) return;
  const batch = pendingLines;
  pendingLines = [];

  const query = filterInput.value.trim().toLowerCase();
  const minLevel = Number.parseInt(levelSelect.value, 10) as LogLevel;
  const fragment = document.createDocumentFragment();
  let appended = 0;
  for (const line of batch) {
    if (!matchesCurrentFilter(line, query, minLevel)) continue;
    const row = document.createElement('div');
    row.className = `log-row log-level-${line.level}`;
    row.textContent = `${line.timestamp ?? ''} ${levelLabel(line.level)} ${line.tag ?? ''}: ${line.message}`;
    fragment.appendChild(row);
    appended++;
  }
  if (appended === 0) return;
  logEl.appendChild(fragment);
  // Тот же предел, что и на буфере allLines -- ограничивает число живых
  // DOM-узлов независимо от фильтра.
  while (logEl.children.length > MAX_LINES) {
    logEl.firstElementChild?.remove();
  }
  if (autoscrollCheckbox.checked) {
    logEl.scrollTop = logEl.scrollHeight;
  }
}

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
    scheduleAppend(parsed);
  });
  // Процесс adb logcat мог завершиться сам (устройство отключили, оборвалось
  // Wi-Fi-соединение) -- без этого стрим молча замолкал: кнопки продолжали
  // показывать "запущено", хотя новых строк больше никогда не будет.
  unsubscribeEnded = adbApi.onLogcatEnded((serial) => {
    if (serial !== activeSerial || !isRunning) return;
    isRunning = false;
    updateButtons();
    statusEl.textContent = 'Поток logcat неожиданно оборвался — устройство отключилось или потеряно соединение. Нажмите «Старт», чтобы возобновить.';
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
  // Полная пересборка отражает СЕЙЧАС же весь allLines (включая ещё не
  // сброшенные scheduleAppend()) -- без отмены отложенного flushPendingLines()
  // те же строки дописались бы в DOM ещё раз на следующем кадре.
  cancelScheduledAppend();

  const query = filterInput.value.trim().toLowerCase();
  const minLevel = Number.parseInt(levelSelect.value, 10) as LogLevel;

  const filtered = allLines.filter((line) => matchesCurrentFilter(line, query, minLevel));

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
