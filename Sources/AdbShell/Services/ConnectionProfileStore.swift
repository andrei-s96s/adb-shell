import Foundation
import SwiftUI

struct ConnectionProfile: Codable, Identifiable, Equatable {
    let id: UUID
    var name: String
    var host: String
    var autoConnect: Bool

    init(name: String, host: String, autoConnect: Bool = false) {
        self.id = UUID()
        self.name = name
        self.host = host
        self.autoConnect = autoConnect
    }
}

/// Сохранённые профили сетевого adb-подключения (IP/порт + имя), опционально
/// с автоподключением при старте приложения. Хранится в UserDefaults как JSON.
@MainActor
final class ConnectionProfileStore: ObservableObject {
    @Published private(set) var profiles: [ConnectionProfile] = []

    private static let key = "connectionProfiles"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        load()
    }

    var autoConnectProfiles: [ConnectionProfile] {
        profiles.filter(\.autoConnect)
    }

    func add(name: String, host: String) {
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        let trimmedHost = host.trimmingCharacters(in: .whitespaces)
        guard !trimmedHost.isEmpty else { return }
        let finalName = trimmedName.isEmpty ? trimmedHost : trimmedName
        if let idx = profiles.firstIndex(where: { $0.host == trimmedHost }) {
            profiles[idx].name = finalName
        } else {
            profiles.append(ConnectionProfile(name: finalName, host: trimmedHost))
        }
        save()
    }

    func remove(_ id: UUID) {
        profiles.removeAll { $0.id == id }
        save()
    }

    func toggleAutoConnect(_ id: UUID) {
        guard let idx = profiles.firstIndex(where: { $0.id == id }) else { return }
        profiles[idx].autoConnect.toggle()
        save()
    }

    /// Сериализует все профили в JSON — для экспорта на диск и переноса на другую машину.
    func exportJSON() -> Data? {
        try? JSONEncoder().encode(profiles)
    }

    /// Импортирует профили из JSON, полученного `exportJSON()`. Добавляет только
    /// те, которых ещё нет (по id) — повторный импорт того же файла не плодит дубликаты.
    func importJSON(_ data: Data) throws {
        let imported = try JSONDecoder().decode([ConnectionProfile].self, from: data)
        let existingIDs = Set(profiles.map(\.id))
        profiles += imported.filter { !existingIDs.contains($0.id) }
        save()
    }

    private func load() {
        guard let data = defaults.data(forKey: Self.key),
              let decoded = try? JSONDecoder().decode([ConnectionProfile].self, from: data) else { return }
        profiles = decoded
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(profiles) else { return }
        defaults.set(data, forKey: Self.key)
    }
}
