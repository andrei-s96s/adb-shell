// Лёгкий gettext-подобный механизм локализации для строк, которые видит
// пользователь со стороны main-процесса (заголовки/фильтры системных
// диалогов, пункты трея, текст уведомлений) -- отдельный набор из
// src/renderer/i18n.ts (тот же приём, другой словарь: там на порядок больше
// строк, и renderer компилируется отдельным tsconfig, так что общий модуль
// пришлось бы включать в оба конфига ради полутора десятков строк общей
// логики). Русский текст используется как ключ словаря перевода напрямую --
// t('Русский текст') возвращает английский перевод, если currentLocale ===
// 'en' и он есть в словаре, иначе возвращает исходный текст без изменений.
// Так забытая обёртка t(...) или опечатка в словаре в худшем случае
// показывает русский текст, а не пустую строку.

const EN_TRANSLATIONS: Record<string, string> = {
  'Выберите папку для библиотеки APK': 'Choose a folder for the APK library',
  'Добавить APK в библиотеку': 'Add APK to the library',
  'Выберите файл для отправки на устройство': 'Choose a file to push to the device',
  'Сохранить как': 'Save as',
  'Сохранить файл': 'Save file',
  'Сохранить bugreport': 'Save bugreport',
  'Сохранить скриншот': 'Save screenshot',
  'Куда сохранить скриншоты со всех устройств': 'Where to save screenshots from all devices',
  'Записать зеркалирование в файл': 'Record mirroring to a file',
  'Выберите APK': 'Choose APK',
  'Выберите APK (можно несколько)': 'Choose APK (multiple allowed)',
  'Экспорт набора приложений': 'Export app bundle',
  'Импорт набора приложений': 'Import app bundle',
  'Экспортировать APK': 'Export APK',
  'Экспорт профилей подключения': 'Export connection profiles',
  'Импорт профилей подключения': 'Import connection profiles',
  'Экспорт макросов': 'Export macros',
  'Импорт макросов': 'Import macros',
  'Экспорт CSV': 'Export CSV',
  'Сохранить': 'Save',
  'Скриншот сохранён': 'Screenshot saved',
  'Не удалось сделать скриншот': 'Could not take a screenshot',
  'Макрос «{name}» (хоткей)': 'Macro "{name}" (hotkey)',
  'Макрос «{name}» — ошибка': 'Macro "{name}" — error',
  'Выполнен полностью': 'Completed fully',
  'Остановлен на ошибке': 'Stopped on an error',
  'Высокая нагрузка CPU': 'High CPU load',
  'CPU: {percent}%': 'CPU: {percent}%',
  'Низкий заряд батареи': 'Low battery',
  'Батарея: {percent}%': 'Battery: {percent}%',
};

export type Locale = 'ru' | 'en';

let currentLocale: Locale = 'ru';

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

/** Плейсхолдеры вида {name} подставляются после выбора перевода -- словарь
 * на обоих языках должен использовать один и тот же плейсхолдер. Пропущенная
 * переменная оставляет токен как есть, а не выбрасывает исключение --
 * лишний повод не уронить показ диалога из-за опечатки в имени переменной. */
export function t(ru: string, vars?: Record<string, string | number>): string {
  const text = currentLocale === 'en' ? (EN_TRANSLATIONS[ru] ?? ru) : ru;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}
