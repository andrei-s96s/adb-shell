// Порт Sources/AdbShell/Services/ShellQuoting.swift — экранирование текста
// для безопасной подстановки в команду, которую `adb shell` пересобирает в
// одну строку и передаёт shell на устройстве. Одинарные кавычки безопаснее
// posix-экранирования пробелов/спецсимволов по одному, и не ломаются на
// юникоде/эмодзи.

export function singleQuoted(text: string): string {
  return `'${text.replace(/'/g, "'\\''")}'`;
}
