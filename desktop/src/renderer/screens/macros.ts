// Порт MacroView из Sources/AdbShell/Views/MacroView.swift — именованные
// последовательности adb-команд, запускаются одной кнопкой.

import { adbApi, el, errorMessage } from '../api.js';
import type { Macro, MacroRunResult } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';
import { openModal } from '../modal.js';

let listEl: HTMLUListElement;
let statusEl: HTMLDivElement;
let macros: Macro[] = [];
let runningMacroId: string | undefined;
/** Результаты последнего запуска, по macro.id -- шаги сверяются по индексу
 * (как в оригинале: шаг вроде "wait-for-device" может повторяться, сверка
 * по тексту была бы неоднозначной). */
const lastResults = new Map<string, MacroRunResult[]>();
let expandedMacroId: string | undefined;

const VARIABLE_RE = /\$\{([A-Za-z0-9_]+)\}/g;

/** Дубликат MacroRunner.variableNames (main/macros/macroRunnerLogic.ts) —
 * renderer не импортирует файлы main/* напрямую, см. комментарий в api.ts. */
function extractVariableNames(macro: Macro): string[] {
  const seen: string[] = [];
  for (const step of macro.steps) {
    for (const match of step.argsLine.matchAll(VARIABLE_RE)) {
      if (!seen.includes(match[1])) seen.push(match[1]);
    }
  }
  return seen;
}

export function initMacrosScreen(): void {
  listEl = el<HTMLUListElement>('macros-list');
  statusEl = el<HTMLDivElement>('macros-status');

  el<HTMLButtonElement>('macros-new').addEventListener('click', () => openEditor());
  el<HTMLButtonElement>('macros-export').addEventListener('click', () => {
    adbApi
      .macrosExport()
      .then((saved) => {
        if (saved) statusEl.textContent = 'Экспортировано';
      })
      .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`));
  });
  el<HTMLButtonElement>('macros-import').addEventListener('click', () => {
    adbApi
      .macrosImport()
      .then((updated) => {
        macros = updated;
        statusEl.textContent = 'Импортировано';
        renderList();
      })
      .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`));
  });

  // Список макросов не зависит от устройства -- перерисовываем только для
  // того, чтобы кнопка "Запустить" включалась/выключалась вместе с выбором.
  onDeviceChanged(() => renderList());

  adbApi
    .macrosList()
    .then((list) => {
      macros = list;
      renderList();
    })
    .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`));
}

function renderList(): void {
  listEl.innerHTML = '';
  if (macros.length === 0) {
    listEl.innerHTML = '<li class="hint">Нет макросов — создайте новый кнопкой выше</li>';
    return;
  }
  const serial = getCurrentSerial();
  for (const macro of macros) {
    listEl.appendChild(renderRow(macro, serial));
  }
}

function renderRow(macro: Macro, serial: string | undefined): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'row';
  li.style.flexDirection = 'column';
  li.style.alignItems = 'stretch';

  const main = document.createElement('div');
  main.className = 'device-row-main';

  const label = document.createElement('span');
  label.className = 'device-row-label';
  label.style.cursor = 'pointer';
  const badges = [macro.autorunOnConnect ? '⚡' : '', macro.abortOnFirstFailure ? '⛔' : ''].filter(Boolean).join(' ');
  label.textContent = `${badges ? badges + ' ' : ''}${macro.name} (${macro.steps.length} шаг${macro.steps.length === 1 ? '' : 'ов'})`;
  label.addEventListener('click', () => {
    expandedMacroId = expandedMacroId === macro.id ? undefined : macro.id;
    renderList();
  });
  main.appendChild(label);

  const actions = document.createElement('div');
  actions.className = 'device-row-actions';

  const runBtn = document.createElement('button');
  runBtn.textContent = runningMacroId === macro.id ? '…' : 'Запустить';
  runBtn.disabled = !serial || runningMacroId !== undefined;
  runBtn.title = serial ? '' : 'Нет подключённого устройства';
  runBtn.addEventListener('click', () => {
    if (serial) void startRun(macro, serial);
  });
  actions.appendChild(runBtn);

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Изменить';
  editBtn.addEventListener('click', () => openEditor(macro));
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '✕';
  deleteBtn.title = 'Удалить';
  deleteBtn.addEventListener('click', () => {
    adbApi
      .macrosRemove(macro.id)
      .then((updated) => {
        macros = updated;
        renderList();
      })
      .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`));
  });
  actions.appendChild(deleteBtn);

  main.appendChild(actions);
  li.appendChild(main);

  if (expandedMacroId === macro.id) {
    const stepsEl = document.createElement('ul');
    stepsEl.className = 'scroll-list small';
    stepsEl.style.marginTop = '6px';
    const results = lastResults.get(macro.id);
    macro.steps.forEach((step, index) => {
      const stepLi = document.createElement('li');
      stepLi.className = 'row';
      const result = results?.[index];
      const icon = result ? (result.isError ? '✗ ' : '✓ ') : '';
      const stepLabel = document.createElement('span');
      stepLabel.textContent = `${icon}adb ${step.argsLine}`;
      if (result?.isError) stepLabel.style.color = 'var(--cp-crimson)';
      stepLi.appendChild(stepLabel);
      stepsEl.appendChild(stepLi);
    });
    li.appendChild(stepsEl);
  }

  return li;
}

async function startRun(macro: Macro, serial: string): Promise<void> {
  const varNames = extractVariableNames(macro);
  const variables = varNames.length > 0 ? await promptVariables(macro.name, varNames) : {};
  if (variables === undefined) return; // отменено в диалоге переменных

  runningMacroId = macro.id;
  renderList();
  statusEl.textContent = `Выполняется «${macro.name}»…`;
  try {
    const outcome = await adbApi.macrosRun(macro.id, serial, variables);
    lastResults.set(macro.id, outcome.results);
    expandedMacroId = macro.id;
    statusEl.textContent = outcome.completedFully ? 'Готово' : 'Остановлено на ошибке';
    try {
      new Notification(`Макрос «${macro.name}»`, {
        body: outcome.completedFully ? 'Выполнен полностью' : 'Остановлен на ошибке',
      });
    } catch {
      // Notification может быть недоступен в некоторых окружениях -- не критично.
    }
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  } finally {
    runningMacroId = undefined;
    renderList();
  }
}

function promptVariables(macroName: string, names: string[]): Promise<Record<string, string> | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const modal = openModal(`Переменные — ${macroName}`, (body) => {
      const inputs = new Map<string, HTMLInputElement>();
      for (const name of names) {
        const row = document.createElement('div');
        row.className = 'connect-row';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'hint';
        labelSpan.style.minWidth = '100px';
        labelSpan.textContent = name;
        row.appendChild(labelSpan);
        const input = document.createElement('input');
        inputs.set(name, input);
        row.appendChild(input);
        body.appendChild(row);
      }
      const runBtn = document.createElement('button');
      runBtn.type = 'button';
      runBtn.textContent = 'Запустить';
      runBtn.addEventListener('click', () => {
        const variables: Record<string, string> = {};
        for (const [name, input] of inputs) variables[name] = input.value;
        settled = true;
        modal.close();
        resolve(variables);
      });
      body.appendChild(runBtn);
    });
    const originalClose = modal.close;
    modal.close = () => {
      originalClose();
      if (!settled) resolve(undefined);
    };
  });
}

function openEditor(existing?: Macro): void {
  openModal(existing ? 'Изменить макрос' : 'Новый макрос', (body, modal) => {
    const nameInput = document.createElement('input');
    nameInput.placeholder = 'Имя макроса';
    nameInput.value = existing?.name ?? '';
    nameInput.style.width = '100%';
    nameInput.style.marginBottom = '8px';
    body.appendChild(nameInput);

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'adb root\nadb remount\nadb shell ...';
    textarea.rows = 10;
    textarea.style.width = '100%';
    textarea.style.fontFamily = 'var(--cp-mono)';
    textarea.style.fontSize = '12px';
    textarea.style.padding = '8px';
    textarea.style.borderRadius = '8px';
    textarea.style.border = '1px solid var(--cp-hairline)';
    textarea.style.background = 'var(--cp-bg-panel-alt)';
    textarea.style.color = 'var(--cp-text-primary)';
    textarea.value = existing ? existing.steps.map((s) => `adb ${s.argsLine}`).join('\n') : '';
    body.appendChild(textarea);

    const stepCountEl = document.createElement('div');
    stepCountEl.className = 'hint';
    body.appendChild(stepCountEl);
    const updateStepCount = (): void => {
      const count = textarea.value
        .split(/\r\n|\r|\n/)
        .map((l) => l.trim())
        .filter((l) => l.toLowerCase().startsWith('adb ')).length;
      stepCountEl.textContent = `Строк, распознанных как шаги: ${count}`;
    };
    textarea.addEventListener('input', updateStepCount);
    updateStepCount();

    const flagsRow = document.createElement('div');
    flagsRow.className = 'toolbar';
    const abortLabel = document.createElement('label');
    abortLabel.className = 'checkbox-label';
    const abortCheckbox = document.createElement('input');
    abortCheckbox.type = 'checkbox';
    abortCheckbox.checked = existing?.abortOnFirstFailure ?? false;
    abortLabel.appendChild(abortCheckbox);
    abortLabel.append(' остановиться на первой ошибке');
    flagsRow.appendChild(abortLabel);

    const autorunLabel = document.createElement('label');
    autorunLabel.className = 'checkbox-label';
    const autorunCheckbox = document.createElement('input');
    autorunCheckbox.type = 'checkbox';
    autorunCheckbox.checked = existing?.autorunOnConnect ?? false;
    autorunLabel.appendChild(autorunCheckbox);
    autorunLabel.append(' автозапуск при подключении устройства');
    flagsRow.appendChild(autorunLabel);
    body.appendChild(flagsRow);

    const errorEl = document.createElement('div');
    errorEl.className = 'error';
    body.appendChild(errorEl);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Сохранить';
    saveBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        errorEl.textContent = 'Укажите имя макроса';
        return;
      }
      const action = existing
        ? adbApi.macrosUpdate(existing.id, name, textarea.value, autorunCheckbox.checked, abortCheckbox.checked)
        : adbApi.macrosAdd(name, textarea.value, autorunCheckbox.checked, abortCheckbox.checked);
      action
        .then((updated) => {
          if (updated.length === macros.length && !existing) {
            errorEl.textContent = 'Не удалось разобрать ни одного шага (строки должны начинаться с "adb ")';
            return;
          }
          macros = updated;
          renderList();
          modal.close();
        })
        .catch((error) => (errorEl.textContent = errorMessage(error)));
    });
    body.appendChild(saveBtn);
  });
}
