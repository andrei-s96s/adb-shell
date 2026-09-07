// Переключатель языка -- два независимых <select> с одинаковым поведением:
// #locale-switch в сайдбаре (виден с самого первого экрана, без
// подключённого устройства) и #settings-locale во вкладке "Настройки"
// (тот же выбор развёрнуто, человеческими названиями языков). Оба меняют
// один и тот же settings.locale и ведут себя одинаково при смене -- поэтому
// общая функция, а не дублирование в settings.ts.

import { adbApi } from './api.js';
import { getLocale, Locale } from './i18n.js';

/** Сохраняет выбор языка и сразу перезагружает окно. Полноценный
 * перезапуск всего приложения не нужен -- location.reload() заново
 * прогоняет renderer.ts с нуля, включая его bootLocale() в самом начале,
 * так что весь интерфейс уже строится на новом языке (см. i18n.ts про то,
 * почему перерисовать уже построенный интерфейс на лету сложнее и рискованнее). */
async function changeLocale(locale: Locale): Promise<void> {
  if (locale === getLocale()) return;
  await adbApi.settingsUpdate({ locale });
  location.reload();
}

export function initLocaleSwitchers(): void {
  const selects = document.querySelectorAll<HTMLSelectElement>('#locale-switch, #settings-locale');
  for (const select of selects) {
    select.value = getLocale();
    select.addEventListener('change', () => void changeLocale(select.value as Locale));
  }
}
