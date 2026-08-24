import Foundation

/// Один шаг макроса — аргументы `adb` без самого токена `adb` и без выбора
/// устройства (serial всегда берётся из текущей вкладки): например
/// `"wait-for-device"`, `"root"`, `"shell iptables -P INPUT ACCEPT"`.
///
/// `argsLine` может содержать переменные вида `${NAME}` — перед запуском
/// макроса пользователя просят подставить значения (см. MacroRunner).
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
struct Macro: Identifiable, Equatable, Codable {
    let id: UUID
    var name: String
    var steps: [MacroStep]
    /// Если true — макрос запускается автоматически, как только устройство
    /// становится готовым (подключено и авторизовано), см. DevicesViewModel.
    var autorunOnConnect: Bool
    /// Если true — выполнение останавливается на первом же шаге, завершившемся
    /// ошибкой (ненулевой exit code), вместо того чтобы идти до конца.
    var abortOnFirstFailure: Bool

    init(name: String, steps: [MacroStep] = [], autorunOnConnect: Bool = false, abortOnFirstFailure: Bool = false) {
        self.id = UUID()
        self.name = name
        self.steps = steps
        self.autorunOnConnect = autorunOnConnect
        self.abortOnFirstFailure = abortOnFirstFailure
    }

    private enum CodingKeys: String, CodingKey { case id, name, steps, autorunOnConnect, abortOnFirstFailure }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        steps = try c.decode([MacroStep].self, forKey: .steps)
        // decodeIfPresent — макросы, сохранённые до появления этих полей, не должны
        // ломать декодирование целиком (MacroStore иначе молча потерял бы их все).
        autorunOnConnect = try c.decodeIfPresent(Bool.self, forKey: .autorunOnConnect) ?? false
        abortOnFirstFailure = try c.decodeIfPresent(Bool.self, forKey: .abortOnFirstFailure) ?? false
    }
}
