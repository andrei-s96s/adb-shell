// Порт MacroView из Sources/AdbShell/Views/MacroView.swift — именованные
// последовательности adb-команд, запускаются одной кнопкой.

import { adbApi, el, errorMessage } from '../api.js';
import type { Macro, MacroRunResult } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';
import { openModal, openTextPromptModal } from '../modal.js';

let listEl: HTMLUListElement;
let statusEl: HTMLDivElement;
let tagFilterEl: HTMLDivElement;
let macros: Macro[] = [];
/** Тег, по которому сейчас отфильтрован список -- тот же принцип, что и
 * activeTagFilter в apkLibrary.ts (ApkTagStore), но теги здесь читаются
 * прямо из macros[].tags, отдельного запроса за списком тегов не нужно. */
let activeTagFilter: string | undefined;
let runningMacroId: string | undefined;
/** Результаты последнего запуска, по macro.id -- шаги сверяются по индексу
 * (как в оригинале: шаг вроде "wait-for-device" может повторяться, сверка
 * по тексту была бы неоднозначной). Заполняется теперь ИНКРЕМЕНТАЛЬНО, по
 * мере прихода 'macros:stepResult' (см. подписку в initMacrosScreen), а не
 * только целиком по завершении -- renderRow() ниже уже был готов к
 * частично заполненному массиву (незаполненные индексы просто не
 * получают ✓/✗), это ровно то поведение, которое нужно для живого
 * прогресса. */
const lastResults = new Map<string, MacroRunResult[]>();
let expandedMacroId: string | undefined;
/** runId запуска, который СЕЙЧАС отслеживается этим экраном (см.
 * onMacroStepResult выше) -- отличает "мой" запуск (через кнопку
 * "Запустить" здесь) от другого запуска того же macroId, случайно
 * совпавшего по времени (автозапуск на другом устройстве). */
let currentRunId: string | undefined;
/** Аккселераторы, реально зарегистрированные ПРЯМО СЕЙЧАС на main-стороне
 * (см. applyMacroHotkeys в main.ts) -- макрос с назначенным, но не
 * попавшим сюда hotkeyAccelerator получает в списке предупреждающий
 * бейдж (занят скриншот-хоткеем/другим макросом/ОС, или есть переменные
 * ${ИМЯ}, для которых хоткей не регистрируется в принципе). */
let activeHotkeyAccelerators = new Set<string>();

async function refreshActiveHotkeys(): Promise<void> {
  try {
    activeHotkeyAccelerators = new Set(await adbApi.macrosActiveHotkeys());
  } catch {
    // Бейдж необязателен -- список макросов остаётся рабочим и без него.
  }
}

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
  tagFilterEl = el<HTMLDivElement>('macros-tag-filter');

  // Живой прогресс шагов -- runMacro() на main-стороне зовёт onStep() после
  // КАЖДОГО шага, а не только в самом конце (см. MacroRunner.ts); runId
  // сопоставляет событие с ТЕМ ЗАПУСКОМ, который сейчас отслеживается здесь
  // (currentRunId ниже), а не с каким-то другим — макрос мог параллельно
  // запуститься автозапуском на другом устройстве, currentRunId отличает
  // "мой" запуск от "чужого" с тем же macroId.
  adbApi.onMacroStepResult((runId, macroId, index, total, result) => {
    if (runId !== currentRunId) return;
    const results = lastResults.get(macroId) ?? [];
    results[index] = result;
    lastResults.set(macroId, results);
    if (runningMacroId === macroId) {
      const macro = macros.find((m) => m.id === macroId);
      statusEl.textContent = `Выполняется «${macro?.name ?? macroId}» — шаг ${index + 1}/${total}…`;
    }
    if (expandedMacroId === macroId) renderList();
  });

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
        // Импортированные макросы могли принести свои теги.
        renderTagFilter();
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
      renderTagFilter();
      renderList();
    })
    .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`));
  void refreshActiveHotkeys().then(renderList);
}

/** Чипы-фильтр по тегам макросов -- порт renderTagFilter() из apkLibrary.ts
 * (ApkTagStore), но список тегов собирается прямо из macros[].tags, а не из
 * отдельного словаря "путь -> теги": у макроса теги хранятся на самой
 * записи (см. Macro.tags), отдельного запроса за списком тегов не нужно. */
function renderTagFilter(): void {
  const allTags = [...new Set(macros.flatMap((m) => m.tags ?? []))].sort();
  tagFilterEl.innerHTML = '';
  if (activeTagFilter && !allTags.includes(activeTagFilter)) activeTagFilter = undefined;
  for (const tag of allTags) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip' + (tag === activeTagFilter ? ' active' : '');
    chip.textContent = tag;
    chip.addEventListener('click', () => {
      activeTagFilter = activeTagFilter === tag ? undefined : tag;
      renderTagFilter();
      renderList();
    });
    tagFilterEl.appendChild(chip);
  }
}

function renderList(): void {
  listEl.innerHTML = '';
  const visible = activeTagFilter ? macros.filter((m) => (m.tags ?? []).includes(activeTagFilter!)) : macros;
  if (visible.length === 0) {
    listEl.innerHTML =
      macros.length === 0
        ? '<li class="hint">Нет макросов — создайте новый кнопкой выше</li>'
        : '<li class="hint">Нет макросов с этим тегом</li>';
    return;
  }
  const serial = getCurrentSerial();
  for (const macro of visible) {
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
  const hotkeyActive = !!macro.hotkeyAccelerator && activeHotkeyAccelerators.has(macro.hotkeyAccelerator);
  const hotkeyBadge = macro.hotkeyAccelerator ? (hotkeyActive ? '⌨' : '⌨⚠') : '';
  const badges = [macro.autorunOnConnect ? '⚡' : '', macro.abortOnFirstFailure ? '⛔' : '', hotkeyBadge].filter(Boolean).join(' ');
  const hotkeySuffix = macro.hotkeyAccelerator ? ` [${macro.hotkeyAccelerator}]` : '';
  label.textContent = `${badges ? badges + ' ' : ''}${macro.name} (${macro.steps.length} шаг${macro.steps.length === 1 ? '' : 'ов'})${hotkeySuffix}`;
  if (macro.hotkeyAccelerator && !hotkeyActive) {
    label.title = 'Хоткей назначен, но сейчас не активен -- занят другим макросом/приложением/ОС, либо у макроса есть переменные ${ИМЯ}';
  }
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
        // Удалённый макрос мог держать хоткей, занятый у другого макроса --
        // после удаления он мог освободиться и стать активным. Он же мог
        // быть единственным носителем какого-то тега -- фильтр надо
        // пересобрать, иначе в чипах останется тег, которым уже никто не
        // помечен.
        renderTagFilter();
        void refreshActiveHotkeys().then(renderList);
      })
      .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`));
  });
  actions.appendChild(deleteBtn);

  main.appendChild(actions);
  li.appendChild(main);

  const tagsRow = document.createElement('div');
  tagsRow.className = 'row-tags';
  for (const tag of macro.tags ?? []) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    const chipLabel = document.createElement('span');
    chipLabel.textContent = tag;
    chip.appendChild(chipLabel);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Убрать тег';
    removeBtn.addEventListener('click', () => void removeMacroTag(macro, tag));
    chip.appendChild(removeBtn);
    tagsRow.appendChild(chip);
  }
  const addTagBtn = document.createElement('button');
  addTagBtn.type = 'button';
  addTagBtn.className = 'tag-add-btn';
  addTagBtn.textContent = '+ тег';
  addTagBtn.addEventListener('click', () => void promptAddMacroTag(macro));
  tagsRow.appendChild(addTagBtn);
  li.appendChild(tagsRow);

  if (expandedMacroId === macro.id) {
    const stepsEl = document.createElement('ul');
    stepsEl.className = 'scroll-list small';
    stepsEl.style.marginTop = 'var(--space-6)';
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
  currentRunId = crypto.randomUUID();
  // Разворачиваем и очищаем результаты СРАЗУ, не дожидаясь ответа -- шаги
  // начинают заполняться (см. onMacroStepResult в initMacrosScreen) уже во
  // время выполнения, разворачивать список только по завершении больше не
  // нужно. Иначе здесь ещё видны были бы результаты ПРЕДЫДУЩЕГО запуска
  // этого же макроса, пока не придёт первый шаг нового.
  lastResults.set(macro.id, []);
  expandedMacroId = macro.id;
  renderList();
  statusEl.textContent = `Выполняется «${macro.name}»…`;
  try {
    const outcome = await adbApi.macrosRun(macro.id, serial, variables, currentRunId);
    lastResults.set(macro.id, outcome.results);
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
    currentRunId = undefined;
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
    nameInput.style.marginBottom = 'var(--space-8)';
    body.appendChild(nameInput);

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'adb root\nadb remount\nadb shell ...';
    textarea.rows = 10;
    textarea.style.width = '100%';
    textarea.style.fontFamily = 'var(--cp-mono)';
    textarea.style.fontSize = 'var(--fs-12)';
    textarea.style.padding = 'var(--space-8)';
    textarea.style.borderRadius = 'var(--radius-8)';
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

    const hotkeyRow = document.createElement('div');
    hotkeyRow.className = 'connect-row';
    const hotkeyLabel = document.createElement('span');
    hotkeyLabel.className = 'hint';
    hotkeyLabel.textContent = 'Хоткей';
    hotkeyRow.appendChild(hotkeyLabel);
    const hotkeyInput = document.createElement('input');
    hotkeyInput.placeholder = 'например: CommandOrControl+Alt+M (пусто — без хоткея)';
    hotkeyInput.value = existing?.hotkeyAccelerator ?? '';
    hotkeyRow.appendChild(hotkeyInput);
    body.appendChild(hotkeyRow);
    const hotkeyHintEl = document.createElement('div');
    hotkeyHintEl.className = 'hint';
    hotkeyHintEl.textContent =
      'Формат Electron Accelerator (модификаторы через "+": CommandOrControl, Alt, Shift). Работает даже когда окно не в фокусе, но не для макросов с переменными ${ИМЯ} -- их некому спросить без открытого окна.';
    body.appendChild(hotkeyHintEl);

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
      const hotkeyAccelerator = hotkeyInput.value.trim() || undefined;
      const action = existing
        ? adbApi.macrosUpdate(existing.id, name, textarea.value, autorunCheckbox.checked, abortCheckbox.checked, hotkeyAccelerator)
        : adbApi.macrosAdd(name, textarea.value, autorunCheckbox.checked, abortCheckbox.checked, hotkeyAccelerator);
      action
        .then((updated) => {
          if (updated.length === macros.length && !existing) {
            errorEl.textContent = 'Не удалось разобрать ни одного шага (строки должны начинаться с "adb ")';
            return;
          }
          macros = updated;
          // main уже перерегистрировал хоткеи синхронно внутри macros:add/
          // update (см. applyMacroHotkeys в main.ts) -- к моменту этого then
          // сервер уже знает актуальное состояние, можно сразу спросить его.
          void refreshActiveHotkeys().then(renderList);
          modal.close();
        })
        .catch((error) => (errorEl.textContent = errorMessage(error)));
    });
    body.appendChild(saveBtn);
  });
}

async function promptAddMacroTag(macro: Macro): Promise<void> {
  const tag = await openTextPromptModal('Добавить тег', 'тег');
  if (!tag || !tag.trim()) return;
  try {
    macros = await adbApi.macrosAddTag(macro.id, tag);
    renderTagFilter();
    renderList();
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

async function removeMacroTag(macro: Macro, tag: string): Promise<void> {
  try {
    macros = await adbApi.macrosRemoveTag(macro.id, tag);
    renderTagFilter();
    renderList();
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}
