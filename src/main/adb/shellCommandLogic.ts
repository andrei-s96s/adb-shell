// Разбор ввода вкладки Shell: пользователь иногда набирает команду целиком,
// как в реальном терминале (`adb root`, `adb remount`, `adb push ...`), а не
// текст, который должен выполниться ВНУТРИ shell устройства -- в этом случае
// `adb -s <serial> shell "adb root"` падает с "adb: inaccessible or not
// found", потому что adb -- программа хоста, а не устройства. Та же
// проблема уже была решена для макросов (см. main/macros/macrosLogic.ts
// parseSteps) -- здесь то же правило распознавания и вырезания флага
// выбора устройства, применённое к одной строке, а не к многострочному
// тексту.
//
// Живёт в main/ (а не в renderer/, где реально используется) исключительно
// ради тестируемости node:test -- renderer-файлы не входят в тестируемый
// tsconfig-проект. shellScreen.ts дублирует эту логику напрямую (тот же
// принцип, что и для multiSelectLogic.ts / apps.ts).

/** Возвращает остаток строки после `adb ` (и явного флага выбора устройства
 * -d/-e/-s <serial>, если он был указан -- serial вкладка Shell всегда берёт
 * от текущего выбранного устройства, а не из текста), либо undefined, если
 * ввод не начинается с `adb ` или после вырезания флага ничего не осталось. */
export function parseRawAdbCommand(command: string): string | undefined {
  if (!command.toLowerCase().startsWith('adb ')) return undefined;
  let line = command.slice(4).trim();

  for (const flag of ['-d ', '-e ']) {
    if (line.toLowerCase().startsWith(flag)) {
      line = line.slice(flag.length).trim();
      break;
    }
  }
  if (line.toLowerCase().startsWith('-s ')) {
    const rest = line.slice(3).trim();
    const spaceIdx = rest.search(/\s/);
    if (spaceIdx === -1) return undefined;
    line = rest.slice(spaceIdx + 1).trim();
  }

  return line.length > 0 ? line : undefined;
}
