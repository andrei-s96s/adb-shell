import { adbApi, el, errorMessage } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';
import { openScreenshotPreview } from './screenshot.js';
import { openIntentTesterModal } from './intentTester.js';
import { openShellHistoryModal } from './shellHistoryModal.js';

let inputEl: HTMLInputElement;
let logEl: HTMLDivElement;
let runBtn: HTMLButtonElement;
let broadcastEl: HTMLInputElement;
let mirrorBtn: HTMLButtonElement;
let mirrorRecordBtn: HTMLButtonElement;
let mirrorStatusEl: HTMLSpanElement;
let mirroringSerials = new Set<string>();

export function initShellScreen(): void {
  inputEl = el<HTMLInputElement>('shell-input');
  logEl = el<HTMLDivElement>('shell-log');
  runBtn = el<HTMLButtonElement>('shell-run');
  broadcastEl = el<HTMLInputElement>('shell-broadcast');
  mirrorBtn = el<HTMLButtonElement>('shell-mirror');
  mirrorRecordBtn = el<HTMLButtonElement>('shell-mirror-record');
  mirrorStatusEl = el<HTMLSpanElement>('shell-mirror-status');

  runBtn.addEventListener('click', () => void runCommand());
  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void runCommand();
  });
  el<HTMLButtonElement>('shell-screenshot').addEventListener('click', () => {
    const serial = getCurrentSerial();
    if (serial) void openScreenshotPreview(serial);
  });
  el<HTMLButtonElement>('shell-intent').addEventListener('click', () => {
    const serial = getCurrentSerial();
    if (serial) openIntentTesterModal(serial);
  });
  mirrorBtn.addEventListener('click', () => void startMirror());
  mirrorRecordBtn.addEventListener('click', () => void startMirrorWithRecording());
  el<HTMLButtonElement>('shell-mirror-all').addEventListener('click', () => void mirrorAll());
  el<HTMLButtonElement>('shell-favorite').addEventListener('click', () => {
    const text = inputEl.value.trim();
    if (!text) return;
    void adbApi.shellHistoryFavorite(text);
  });
  el<HTMLButtonElement>('shell-history').addEventListener('click', () => {
    openShellHistoryModal((text) => {
      inputEl.value = text;
      document.querySelector('.modal-overlay')?.remove();
      inputEl.focus();
    });
  });

  adbApi.onMirrorStopped((serial) => {
    mirroringSerials.delete(serial);
    renderMirrorState();
  });

  onDeviceChanged((serial) => {
    logEl.innerHTML = '';
    if (!serial) {
      appendLine('Нет подключённого устройства — выберите устройство слева', 'shell-out');
    }
    renderMirrorState();
  });

  void adbApi.mirrorRunningSerials().then((serials) => {
    mirroringSerials = new Set(serials);
    renderMirrorState();
  });
}

function renderMirrorState(): void {
  const serial = getCurrentSerial();
  const isMirroring = serial !== undefined && mirroringSerials.has(serial);
  mirrorBtn.textContent = isMirroring ? 'Зеркалируется' : 'Зеркалировать';
  mirrorBtn.disabled = !serial || isMirroring;
  mirrorRecordBtn.disabled = !serial || isMirroring;
}

/** Порт ScreenMirrorService-кнопок из Sources/AdbShell/Views/ShellRunnerView.swift. */
async function startMirror(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial) return;
  try {
    await adbApi.mirrorLaunch(serial);
    mirroringSerials.add(serial);
    renderMirrorState();
  } catch (error) {
    mirrorStatusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

async function startMirrorWithRecording(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial) return;
  const recordPath = await adbApi.selectRecordPath(serial);
  if (!recordPath) return;
  try {
    await adbApi.mirrorLaunch(serial, recordPath);
    mirroringSerials.add(serial);
    renderMirrorState();
  } catch (error) {
    mirrorStatusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

async function mirrorAll(): Promise<void> {
  try {
    const devices = (await adbApi.listDevices()).filter((d) => d.state === 'device');
    if (devices.length === 0) {
      mirrorStatusEl.textContent = 'Нет готовых устройств';
      return;
    }
    await adbApi.mirrorLaunchGrid(devices.map((d) => d.serial));
    for (const d of devices) mirroringSerials.add(d.serial);
    renderMirrorState();
  } catch (error) {
    mirrorStatusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

/** Дубликат main/adb/shellCommandLogic.ts (см. комментарий там про то, почему
 * не импортируется напрямую -- renderer и main собираются раздельными tsc-
 * проектами с разными rootDir, тот же принцип, что и для multiSelectLogic.ts
 * / apps.ts). Если ввод начинается с `adb ` -- пользователь набрал команду
 * целиком, как в терминале (`adb root`, `adb remount`, `adb push ...`), а не
 * текст, который должен выполниться внутри shell устройства. Возвращает
 * остаток строки после `adb ` (и явного флага выбора устройства -d/-e/-s
 * <serial>, если он был указан -- serial всегда берётся от текущей
 * выбранной вкладки), либо undefined, если это не такой случай. */
function parseRawAdbCommand(command: string): string | undefined {
  if (!command.toLowerCase().startsWith('adb ')) return undefined;
  let line = command.slice(4).trim();

  for (const flag of ['-d ', '-e ']) {
    if (line.toLowerCase().startsWith(flag)) {
      line = line.slice(flag.length).trim();
      break;
    }
  }
  if (line.toLowerCase().startsWith('-s ')) {
    const rest = line.slice(3).trim();
    const spaceIdx = rest.search(/\s/);
    if (spaceIdx === -1) return undefined;
    line = rest.slice(spaceIdx + 1).trim();
  }

  return line.length > 0 ? line : undefined;
}

/** Выполняет одну команду на устройстве -- маршрутизирует между "сырым"
 * adb (см. parseRawAdbCommand) и обычным adb shell. */
function runOnDevice(serial: string, command: string): Promise<string> {
  const rawArgs = parseRawAdbCommand(command);
  return rawArgs !== undefined ? adbApi.runRaw(serial, rawArgs) : adbApi.shell(serial, command);
}

async function runCommand(): Promise<void> {
  const serial = getCurrentSerial();
  const command = inputEl.value.trim();
  if (!serial || !command) return;

  appendLine(`$ ${command}`, 'shell-cmd');
  inputEl.value = '';
  runBtn.disabled = true;
  // Запись в историю происходит один раз независимо от broadcast-режима,
  // до ветвления -- порт того же порядка, что в ShellRunnerView.swift.
  void adbApi.shellHistoryRecord(command);
  try {
    if (broadcastEl.checked) {
      await runBroadcast(command);
    } else {
      const output = await runOnDevice(serial, command);
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
      const output = await runOnDevice(device.serial, command);
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
