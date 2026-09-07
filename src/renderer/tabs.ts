type TabVisibilityListener = (tabId: string, isVisible: boolean) => void;
const visibilityListeners: TabVisibilityListener[] = [];

/** Подписка на смену видимости вкладки -- вызывается на КАЖДУЮ активацию,
 * в т.ч. для панелей, которые остались невидимыми (проще, чем отслеживать
 * "было/стало" здесь же), поэтому обработчик должен быть дешёвым и
 * идемпотентным. Нужно экранам с фоновым поллингом (Мониторинг, Logcat) --
 * переключение вкладок раньше было чисто CSS-классом без единого сигнала
 * "вкладка скрылась/показалась", так что setInterval-поллинг и стрим
 * logcat продолжали молотить adb-запросами в фоне, пока пользователь
 * работал в Files/Apps/Shell. */
export function onTabVisibilityChanged(listener: TabVisibilityListener): void {
  visibilityListeners.push(listener);
}

export function initTabs(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#tabs button'));
  const panels = Array.from(document.querySelectorAll<HTMLElement>('.tab-panel'));

  function activate(tabId: string): void {
    for (const button of buttons) {
      button.classList.toggle('active', button.dataset.tab === tabId);
    }
    for (const panel of panels) {
      const isVisible = panel.id === `tab-${tabId}`;
      panel.classList.toggle('active', isVisible);
      const panelTabId = panel.id.replace(/^tab-/, '');
      for (const listener of visibilityListeners) listener(panelTabId, isVisible);
    }
  }

  for (const button of buttons) {
    button.addEventListener('click', () => activate(button.dataset.tab ?? ''));
  }

  activate(buttons[0]?.dataset.tab ?? '');
}
