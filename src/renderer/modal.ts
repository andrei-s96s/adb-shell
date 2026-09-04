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
