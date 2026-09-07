// Журнал запусков макросов -- кто/когда/где запускал макрос и чем это
// закончилось (см. MacroRunHistoryStore). В отличие от результатов на
// самом экране "Макросы" (видны только пока не запущен другой макрос
// поверх), эта история переживает и другие запуски, и перезапуск
// приложения. Клик по строке разворачивает результаты шагов -- тот же
// принцип, что и у строки макроса в macros.ts.

import { adbApi, errorMessage } from '../api.js';
import type { MacroRunHistoryEntry } from '../api.js';
import { openModal } from '../modal.js';
import { t, formatDateTime } from '../i18n.js';

let expandedEntryId: string | undefined;

export function openMacroRunHistoryModal(): void {
  expandedEntryId = undefined;
  openModal(t('История запусков макросов'), (body) => {
    body.innerHTML = `<p class="hint">${t('Загрузка…')}</p>`;
    adbApi
      .macroRunHistoryList()
      .then((items) => render(body, items))
      .catch((error) => {
        body.innerHTML = `<p class="error">${t('Ошибка')}: ${errorMessage(error)}</p>`;
      });
  });
}

function render(body: HTMLDivElement, items: MacroRunHistoryEntry[]): void {
  body.innerHTML = '';

  const list = document.createElement('ul');
  list.className = 'scroll-list small';
  if (items.length === 0) {
    list.innerHTML = `<li class="hint">${t('Пока пусто -- журнал наполняется по мере запуска макросов')}</li>`;
  }
  for (const entry of items) {
    const li = document.createElement('li');
    li.className = 'row';
    li.style.flexDirection = 'column';
    li.style.alignItems = 'stretch';

    const main = document.createElement('div');
    main.className = 'device-row-main';

    const label = document.createElement('span');
    label.className = 'device-row-label';
    label.style.cursor = 'pointer';
    const icon = entry.completedFully ? '✓' : '✗';
    label.textContent = `${icon} «${entry.macroName}» — ${entry.deviceLabel} — ${formatDateTime(entry.startedAtMs)}`;
    if (!entry.completedFully) label.style.color = 'var(--cp-crimson)';
    label.addEventListener('click', () => {
      expandedEntryId = expandedEntryId === entry.id ? undefined : entry.id;
      render(body, items);
    });
    main.appendChild(label);
    li.appendChild(main);

    if (expandedEntryId === entry.id) {
      const stepsEl = document.createElement('ul');
      stepsEl.className = 'scroll-list small';
      stepsEl.style.marginTop = 'var(--space-6)';
      if (entry.results.length === 0) {
        stepsEl.innerHTML = `<li class="hint">${t('Нет данных по шагам')}</li>`;
      }
      for (const result of entry.results) {
        const stepLi = document.createElement('li');
        stepLi.className = 'row';
        const stepIcon = result.skipped ? '⏭' : result.isError ? '✗' : '✓';
        const stepLabel = document.createElement('span');
        stepLabel.textContent = `${stepIcon} ${result.argsLine ? `adb ${result.argsLine}` : t('(задержка)')}`;
        if (result.isError) stepLabel.style.color = 'var(--cp-crimson)';
        else if (result.skipped) stepLabel.style.color = 'var(--cp-text-muted)';
        stepLi.appendChild(stepLabel);
        stepsEl.appendChild(stepLi);
      }
      li.appendChild(stepsEl);
    }

    list.appendChild(li);
  }
  body.appendChild(list);

  if (items.length > 0) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = t('Очистить историю');
    clearBtn.style.marginTop = 'var(--space-8)';
    clearBtn.addEventListener('click', () => {
      adbApi
        .macroRunHistoryClear()
        .then((updated) => render(body, updated))
        .catch(() => {});
    });
    body.appendChild(clearBtn);
  }
}
