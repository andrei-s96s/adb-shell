// Порт ScreenshotPreviewSheet из Sources/AdbShell/Views/ShellRunnerView.swift
// -- ручная кнопка "Screenshot" в Shell всегда открывает превью с явным
// выбором действия (Copy/Save As), в отличие от глобального хоткея
// (main.ts, captureScreenshotToDesktop) который сохраняет тихо без превью.

import { adbApi, errorMessage } from '../api.js';
import { openModal } from '../modal.js';

export async function openScreenshotPreview(serial: string): Promise<void> {
  const modal = openModal('Скриншот', (body) => {
    body.innerHTML = '<p class="hint">Захват…</p>';
  });

  let base64Png: string;
  try {
    base64Png = await adbApi.screenshot(serial);
  } catch (error) {
    modal.body.innerHTML = `<p class="error">Ошибка: ${errorMessage(error)}</p>`;
    return;
  }

  modal.body.innerHTML = '';
  const img = document.createElement('img');
  img.src = `data:image/png;base64,${base64Png}`;
  img.style.maxWidth = '420px';
  img.style.maxHeight = '420px';
  img.style.display = 'block';
  img.style.margin = '0 auto 12px';
  img.style.borderRadius = '8px';
  modal.body.appendChild(img);

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const statusEl = document.createElement('div');
  statusEl.className = 'hint';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', () => {
    adbApi
      .clipboardWriteImagePng(base64Png)
      .then(() => (statusEl.textContent = 'Скопировано в буфер'))
      .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`));
  });
  toolbar.appendChild(copyBtn);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save As…';
  saveBtn.addEventListener('click', () => {
    adbApi
      .saveScreenshot(base64Png)
      .then((saved) => {
        if (saved) statusEl.textContent = 'Сохранено';
      })
      .catch((error) => (statusEl.textContent = `Ошибка: ${errorMessage(error)}`));
  });
  toolbar.appendChild(saveBtn);

  modal.body.appendChild(toolbar);
  modal.body.appendChild(statusEl);
}
