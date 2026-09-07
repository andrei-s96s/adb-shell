// Применяет t() к статической разметке index.html -- элементам, чей текст
// известен заранее и не строится JS-кодом при инициализации экрана (тот
// код уже сам вызывает t() в нужных местах, см. каждый screens/*.ts).
// Разметка размечена служебными data-i18n* атрибутами:
//   data-i18n           -- textContent самого элемента это ключ словаря
//   data-i18n-title     -- атрибут title это ключ словаря
//   data-i18n-placeholder -- атрибут placeholder это ключ словаря
// Элементы с дочерними элементами внутри (например, чекбокс + текст в одном
// <label>) НЕ размечаются data-i18n напрямую -- textContent = ... стёр бы
// дочерний <input>. Вместо этого в разметке текст обёрнут в свой собственный
// <span data-i18n>, а data-i18n-title вешается прямо на label (это просто
// атрибут, дочерних элементов не трогает).
//
// Пробелы/переносы строк вокруг текста в HTML-исходнике (форматирование
// отступами) схлопываются в один пробел перед поиском в словаре -- иначе
// ключ пришлось бы вписывать в словарь с точным количеством пробелов/
// переносов ровно как он выглядит в HTML-файле, что рассыпалось бы при
// любой последующей переформатировке разметки.

import { t } from './i18n.js';

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function applyStaticI18n(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = normalizeWhitespace(el.textContent ?? '');
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    if (el.title) el.title = t(el.title);
  });
  document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
    if (el.placeholder) el.placeholder = t(el.placeholder);
  });
}
