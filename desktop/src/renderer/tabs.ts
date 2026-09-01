export function initTabs(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#tabs button'));
  const panels = Array.from(document.querySelectorAll<HTMLElement>('.tab-panel'));

  function activate(tabId: string): void {
    for (const button of buttons) {
      button.classList.toggle('active', button.dataset.tab === tabId);
    }
    for (const panel of panels) {
      panel.classList.toggle('active', panel.id === `tab-${tabId}`);
    }
  }

  for (const button of buttons) {
    button.addEventListener('click', () => activate(button.dataset.tab ?? ''));
  }

  activate(buttons[0]?.dataset.tab ?? '');
}
