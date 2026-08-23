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
