// Небольшой переиспользуемый оверлей-хелпер — до сих пор в приложении не
// было ни одного "sheet"/модального окна (только вкладки и нативные
// диалоги), а начиная с этой волны их сразу несколько (сравнение устройств,
// ANR/tombstone-просмотр, позже — intent-тестер, редактор макросов, превью
// скриншота). Один общий примитив вместо похожей разметки в каждом экране.

export interface ModalHandle {
  close: () => void;
  body: HTMLDivElement;
}

export function openModal(title: string, build: (body: HTMLDivElement, modal: ModalHandle) => void): ModalHandle {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const panel = document.createElement('div');
  panel.className = 'modal-panel';

  const header = document.createElement('div');
  header.className = 'modal-header';
  const titleEl = document.createElement('h2');
  titleEl.textContent = title;
  header.appendChild(titleEl);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Закрыть';
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'modal-body';
  panel.appendChild(body);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const handle: ModalHandle = {
    body,
    close: () => overlay.remove(),
  };

  closeBtn.addEventListener('click', () => handle.close());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) handle.close();
  });
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      handle.close();
      document.removeEventListener('keydown', onKeydown);
    }
  };
  document.addEventListener('keydown', onKeydown);

  build(body, handle);
  return handle;
}

/** Замена window.prompt(), который Electron сознательно не реализует (окно
 * либо не появляется, либо сразу возвращает null — см.
 * https://github.com/electron/electron/issues/472). Возвращает введённый
 * текст, либо null при отмене (кнопка "Отмена", крестик, клик по фону,
 * Escape) — то есть тот же контракт, что и у window.prompt(). */
export function openTextPromptModal(title: string, placeholder = '', defaultValue = ''): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const modal = openModal(title, (body) => {
      // .modal-panel по умолчанию шириной до 720px -- рассчитан на богатый
      // контент (редактор макросов, intent-тестер), а не на одно поле и две
      // кнопки: без этого класса они повисали слева на пустом пространстве.
      body.parentElement?.classList.add('modal-panel-narrow');

      const row = document.createElement('div');
      row.className = 'connect-row';
      const input = document.createElement('input');
      input.placeholder = placeholder;
      input.value = defaultValue;
      row.appendChild(input);
      body.appendChild(row);

      const actions = document.createElement('div');
      actions.className = 'modal-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Отмена';
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = 'ОК';
      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      body.appendChild(actions);

      const confirm = (): void => {
        settle(input.value.trim());
        modal.close();
      };
      okBtn.addEventListener('click', confirm);
      cancelBtn.addEventListener('click', () => modal.close());
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') confirm();
      });
      queueMicrotask(() => input.focus());
    });

    // closeBtn/overlay-click/Escape в openModal все вызывают handle.close()
    // через косвенное обращение к свойству -- переопределение здесь
    // перехватывает и их, не только кнопку "Отмена".
    const originalClose = modal.close;
    modal.close = () => {
      settle(null);
      originalClose();
    };
  });
}
