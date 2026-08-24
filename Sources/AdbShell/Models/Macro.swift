import Foundation

/// Один шаг макроса — аргументы `adb` без самого токена `adb` и без выбора
/// устройства (serial всегда берётся из текущей вкладки): например
/// `"wait-for-device"`, `"root"`, `"shell iptables -P INPUT ACCEPT"`.
struct MacroStep: Codable, Identifiable, Equatable {
    let id: UUID
    var argsLine: String

    init(argsLine: String) {
        self.id = UUID()
        self.argsLine = argsLine
    }
}

/// Именованная последовательность adb-команд, выполняемая одной кнопкой —
/// например порядок действий при прошивке (`root` → `remount` → серия
/// `shell iptables ...` и т.п.), как в .bat-скриптах.
struct Macro: Codable, Identifiable, Equatable {
    let id: UUID
    var name: String
    var steps: [MacroStep]

    init(name: String, steps: [MacroStep] = []) {
        self.id = UUID()
        self.name = name
        self.steps = steps
    }
}
