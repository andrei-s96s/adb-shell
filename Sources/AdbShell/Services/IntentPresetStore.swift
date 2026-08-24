import Foundation

/// Сохранённые deep link/intent-пресеты — тот же подход, что и у профилей
/// подключения: UserDefaults как JSON.
@MainActor
final class IntentPresetStore: ObservableObject {
    @Published private(set) var presets: [IntentPreset] = []

    private static let key = "intentPresets"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        load()
    }

    func add(name: String, uri: String) {
        let trimmedURI = uri.trimmingCharacters(in: .whitespaces)
        guard !trimmedURI.isEmpty else { return }
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        presets.append(IntentPreset(name: trimmedName.isEmpty ? trimmedURI : trimmedName, uri: trimmedURI))
        save()
    }

    func remove(_ id: UUID) {
        presets.removeAll { $0.id == id }
        save()
    }

    private func load() {
        guard let data = defaults.data(forKey: Self.key),
              let decoded = try? JSONDecoder().decode([IntentPreset].self, from: data) else { return }
        presets = decoded
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(presets) else { return }
        defaults.set(data, forKey: Self.key)
    }
}
