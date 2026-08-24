import Foundation

/// Пользовательские теги для файлов библиотеки APK, по полному пути —
/// файлы не хранят метаданные сами по себе (это просто .apk на диске),
/// поэтому теги живут отдельно в UserDefaults, тот же подход, что и у
/// ников устройств.
@MainActor
final class ApkTagStore: ObservableObject {
    @Published private(set) var tagsByPath: [String: [String]] = [:]

    private static let key = "apkLibraryTags"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        load()
    }

    func tags(for path: String) -> [String] {
        tagsByPath[path] ?? []
    }

    var allTags: [String] {
        Array(Set(tagsByPath.values.flatMap { $0 })).sorted()
    }

    func addTag(_ tag: String, to path: String) {
        let trimmed = tag.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        var existing = tagsByPath[path] ?? []
        guard !existing.contains(trimmed) else { return }
        existing.append(trimmed)
        tagsByPath[path] = existing
        save()
    }

    func removeTag(_ tag: String, from path: String) {
        tagsByPath[path]?.removeAll { $0 == tag }
        if tagsByPath[path]?.isEmpty == true { tagsByPath.removeValue(forKey: path) }
        save()
    }

    private func load() {
        guard let data = defaults.data(forKey: Self.key),
              let decoded = try? JSONDecoder().decode([String: [String]].self, from: data) else { return }
        tagsByPath = decoded
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(tagsByPath) else { return }
        defaults.set(data, forKey: Self.key)
    }
}
