// Вкладка "Донат" -- те же данные (адрес, сеть, QR), что раньше были
// доступны только по внешней ссылке https://andrei-s96s.github.io/adb-shell/
// (кнопка "Поддержать проект" в Настройках открывала её в браузере). Теперь
// это последняя вкладка приложения, и вся информация показана прямо тут --
// внешний переход больше не нужен, settings.ts переключает на неё вместо
// adbApi.openExternal().
//
// Копирование адреса -- порт copyAddress() со страницы-донора: сначала
// navigator.clipboard, если недоступен (или отклонён) -- textarea +
// document.execCommand('copy') как запасной вариант.

import { el } from '../api.js';

let addressEl: HTMLDivElement;
let copiedEl: HTMLDivElement;

export function initDonateScreen(): void {
  addressEl = el<HTMLDivElement>('donate-address');
  copiedEl = el<HTMLDivElement>('donate-copied');
  el<HTMLButtonElement>('donate-copy').addEventListener('click', () => void copyAddress());
}

async function copyAddress(): Promise<void> {
  const text = addressEl.textContent ?? '';
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      showCopied();
      return;
    } catch {
      // падаем в fallback ниже
    }
  }
  fallbackCopy(text);
}

function fallbackCopy(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showCopied();
  } catch {
    // тихо игнорируем -- best effort, как и на исходной странице
  }
  document.body.removeChild(textarea);
}

function showCopied(): void {
  copiedEl.textContent = 'Скопировано / Copied';
  setTimeout(() => {
    copiedEl.textContent = '';
  }, 2000);
}
