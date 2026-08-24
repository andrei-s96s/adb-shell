import Foundation

/// Персистентное хранилище макросов (последовательностей adb-команд) —
/// UserDefaults как JSON, тот же подход, что и в ShellHistoryStore/
/// ConnectionProfileStore.
@MainActor
final class MacroStore: ObservableObject {
    @Published private(set) var macros: [Macro] = []

    nonisolated static let key = "shellMacros"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        load()
    }

    /// Свежее чтение сохранённых макросов напрямую из UserDefaults, без создания
    /// полноценного @MainActor-стора — используется автозапуском по подключению
    /// устройства (DevicesViewModel), которому не нужно наблюдать за изменениями.
    nonisolated static func loadPersisted(defaults: UserDefaults = .standard) -> [Macro] {
        guard let data = defaults.data(forKey: key),
              let decoded = try? JSONDecoder().decode([Macro].self, from: data) else { return [] }
        return decoded
    }

    func add(name: String, rawText: String, autorunOnConnect: Bool = false, abortOnFirstFailure: Bool = false) {
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        let steps = Self.parseSteps(from: rawText)
        guard !trimmedName.isEmpty, !steps.isEmpty else { return }
        macros.append(Macro(name: trimmedName, steps: steps, autorunOnConnect: autorunOnConnect, abortOnFirstFailure: abortOnFirstFailure))
        save()
    }

    func update(_ id: UUID, name: String, rawText: String, autorunOnConnect: Bool = false, abortOnFirstFailure: Bool = false) {
        guard let idx = macros.firstIndex(where: { $0.id == id }) else { return }
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        let steps = Self.parseSteps(from: rawText)
        guard !trimmedName.isEmpty, !steps.isEmpty else { return }
        macros[idx].name = trimmedName
        macros[idx].steps = steps
        macros[idx].autorunOnConnect = autorunOnConnect
        macros[idx].abortOnFirstFailure = abortOnFirstFailure
        save()
    }

    func remove(_ id: UUID) {
        macros.removeAll { $0.id == id }
        save()
    }

    /// Разбирает вставленный текст (в том числе целиком вставленный .bat-скрипт
    /// прошивки) на шаги макроса: берёт только строки, начинающиеся с `adb`
    /// (регистронезависимо), убирает сам токен `adb` и флаг выбора устройства
    /// (`-d`/`-e`/`-s <serial>`, если он был указан в скрипте) — serial макрос
    /// всегда берёт от текущей выбранной вкладки устройства, а не из текста.
    /// Все прочие строки (`@echo off`, `chcp 1251`, `cls`, `pause`, `ipconfig`,
    /// `ifconfig` и т.п. — обычный шум .bat-файлов) молча пропускаются.
    static func parseSteps(from rawText: String) -> [MacroStep] {
        var steps: [MacroStep] = []
        for rawLine in rawText.split(whereSeparator: \.isNewline) {
            var line = rawLine.trimmingCharacters(in: .whitespaces)
            guard line.lowercased().hasPrefix("adb ") else { continue }
            line = String(line.dropFirst(4)).trimmingCharacters(in: .whitespaces)

            for flag in ["-d ", "-e "] where line.hasPrefix(flag) {
                line = String(line.dropFirst(flag.count)).trimmingCharacters(in: .whitespaces)
            }
            if line.lowercased().hasPrefix("-s ") {
                let rest = line.dropFirst(3).trimmingCharacters(in: .whitespaces)
                guard let spaceIdx = rest.firstIndex(where: \.isWhitespace) else { continue }
                line = String(rest[rest.index(after: spaceIdx)...]).trimmingCharacters(in: .whitespaces)
            }

            guard !line.isEmpty else { continue }
            steps.append(MacroStep(argsLine: line))
        }
        return steps
    }

    /// Сериализует все макросы в JSON — для экспорта на диск и переноса на другую машину.
    func exportJSON() -> Data? {
        try? JSONEncoder().encode(macros)
    }

    /// Импортирует макросы из JSON, полученного `exportJSON()`. По умолчанию
    /// добавляет только те, которых ещё нет (по id) — повторный импорт того же
    /// файла не плодит дубликаты.
    func importJSON(_ data: Data) throws {
        let imported = try JSONDecoder().decode([Macro].self, from: data)
        let existingIDs = Set(macros.map(\.id))
        macros += imported.filter { !existingIDs.contains($0.id) }
        save()
    }

    private func load() {
        guard let data = defaults.data(forKey: Self.key),
              let decoded = try? JSONDecoder().decode([Macro].self, from: data) else { return }
        macros = decoded
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(macros) else { return }
        defaults.set(data, forKey: Self.key)
    }
}
