import Foundation

private let nicknamesDefaultsKey = "deviceNicknames"

/// Пользовательские имена устройств по serial — не зависят от adb model,
/// не сбрасываются при переподключении. Тот же подход, что и у языка
/// интерфейса (LocalizationManager + свободная L()): реактивный @MainActor-класс
/// для UI редактирования и nonisolated статический читатель для Device.displayName,
/// который вызывается откуда угодно, включая непривязанные к актору контексты.
@MainActor
final class DeviceNicknameStore: ObservableObject {
    @Published private(set) var nicknames: [String: String]

    init() {
        nicknames = Self.load()
    }

    func setNickname(_ name: String, for serial: String) {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty {
            nicknames.removeValue(forKey: serial)
        } else {
            nicknames[serial] = trimmed
        }
        save()
    }

    nonisolated static func nickname(for serial: String) -> String? {
        load()[serial]
    }

    nonisolated private static func load() -> [String: String] {
        guard let data = UserDefaults.standard.data(forKey: nicknamesDefaultsKey),
              let decoded = try? JSONDecoder().decode([String: String].self, from: data) else { return [:] }
        return decoded
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(nicknames) else { return }
        UserDefaults.standard.set(data, forKey: nicknamesDefaultsKey)
    }
}
