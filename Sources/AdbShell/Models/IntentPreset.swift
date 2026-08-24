import Foundation

/// Сохранённый deep link/URI для повторного запуска через
/// `am start -a android.intent.action.VIEW -d <uri>`.
struct IntentPreset: Codable, Identifiable, Equatable {
    let id: UUID
    var name: String
    var uri: String

    init(name: String, uri: String) {
        self.id = UUID()
        self.name = name
        self.uri = uri
    }
}
