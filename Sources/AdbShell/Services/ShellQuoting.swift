import Foundation

/// Экранирование текста для безопасной подстановки в команду, которую
/// `adb shell` пересобирает в одну строку и передаёт shell на устройстве —
/// одинарные кавычки безопаснее posix-экранирования пробелов/спецсимволов
/// по одному, и не ломаются на юникоде/эмодзи.
enum ShellQuoting {
    static func singleQuoted(_ text: String) -> String {
        "'" + text.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}
