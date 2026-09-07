// Порт Sources/AdbShell/Services/ShellQuoting.swift — экранирование текста
// для безопасной подстановки в команду, которую `adb shell` пересобирает в
// одну строку и передаёт shell на устройстве. Одинарные кавычки безопаснее
// posix-экранирования пробелов/спецсимволов по одному, и не ломаются на
// юникоде/эмодзи.

export function singleQuoted(text: string): string {
  return `'${text.replace(/'/g, "'\\''")}'`;
}

/** Разбивает строку (шаг макроса после подстановки переменных, ручной ввод
 * во вкладке Shell) на argv-токены с учётом кавычек -- упрощённый shlex.
 * Нужен там, где строка идёт напрямую в spawn(bin, args) без shell
 * (AdbService.run()), поэтому наивный `line.split(' ')` передаёт буквальные
 * символы кавычек как часть argv: значение переменной с пробелом в пути
 * (`adb push "${FILE}" /sdcard/`) или аргумент вида `--es text "hello
 * world"` либо роняет команду (ENOENT), либо тихо режет её не в том месте.
 *
 * Правила: вне кавычек пробел/таб разделяет токены; '...' -- буквальный
 * текст без экранирования внутри (симметрично singleQuoted() выше); "..."
 * -- текст, где `\"` и `\\` распознаются как экранированные; вне кавычек
 * `\` экранирует следующий символ (в т.ч. пробел). Незакрытая кавычка в
 * конце строки не считается ошибкой -- накопленный токен всё равно
 * возвращается, это разбор пользовательского ввода в GUI, а не строгий
 * парсер. */
export function tokenizeArgs(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let hasCurrent = false;
  let quote: '"' | "'" | undefined;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote === "'") {
      if (ch === "'") quote = undefined;
      else current += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = undefined;
      else if (ch === '\\' && (line[i + 1] === '"' || line[i + 1] === '\\')) current += line[++i];
      else current += ch;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      if (hasCurrent) {
        tokens.push(current);
        current = '';
        hasCurrent = false;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      hasCurrent = true;
      continue;
    }
    if (ch === '\\' && i + 1 < line.length) {
      current += line[++i];
      hasCurrent = true;
      continue;
    }
    current += ch;
    hasCurrent = true;
  }
  if (hasCurrent) tokens.push(current);
  return tokens;
}
