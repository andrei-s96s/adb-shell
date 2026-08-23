import Foundation
import SwiftUI

struct SavedCommand: Codable, Identifiable, Equatable {
    let id: UUID
    var text: String
    var isFavorite: Bool
    var lastUsed: Date

    init(text: String, isFavorite: Bool = false, lastUsed: Date = Date()) {
        self.id = UUID()
        self.text = text
        self.isFavorite = isFavorite
        self.lastUsed = lastUsed
    }
}

/// Персистентная история shell-команд (`adb shell <...>`) с избранным.
/// Хранится в UserDefaults как JSON — для личного инструмента этого достаточно,
/// не тянем Core Data ради десятка строк.
@MainActor
final class ShellHistoryStore: ObservableObject {
    @Published private(set) var items: [SavedCommand] = []

    private static let key = "shellCommandHistory"
    private let maxRecent = 50
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        load()
    }

    var favorites: [SavedCommand] {
        items.filter(\.isFavorite).sorted { $0.text.localizedCaseInsensitiveCompare($1.text) == .orderedAscending }
    }

    var recent: [SavedCommand] {
        items.filter { !$0.isFavorite }.sorted { $0.lastUsed > $1.lastUsed }
    }

    func record(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        if let idx = items.firstIndex(where: { $0.text == trimmed }) {
            items[idx].lastUsed = Date()
        } else {
            items.append(SavedCommand(text: trimmed))
        }
        // Обрезаем только не-избранные, чтобы избранное не терялось со временем.
        let nonFavoriteOverflow = items.filter { !$0.isFavorite }.sorted { $0.lastUsed > $1.lastUsed }.dropFirst(maxRecent)
        if !nonFavoriteOverflow.isEmpty {
            let toRemove = Set(nonFavoriteOverflow.map(\.id))
            items.removeAll { toRemove.contains($0.id) }
        }
        save()
    }

    func favorite(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        if let idx = items.firstIndex(where: { $0.text == trimmed }) {
            items[idx].isFavorite = true
        } else {
            items.append(SavedCommand(text: trimmed, isFavorite: true))
        }
        save()
    }

    func toggleFavorite(_ id: UUID) {
        guard let idx = items.firstIndex(where: { $0.id == id }) else { return }
        items[idx].isFavorite.toggle()
        save()
    }

    func remove(_ id: UUID) {
        items.removeAll { $0.id == id }
        save()
    }

    private func load() {
        guard let data = defaults.data(forKey: Self.key),
              let decoded = try? JSONDecoder().decode([SavedCommand].self, from: data) else { return }
        items = decoded
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(items) else { return }
        defaults.set(data, forKey: Self.key)
    }
}
