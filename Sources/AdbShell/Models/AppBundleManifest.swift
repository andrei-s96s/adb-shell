import Foundation

/// Формат "набора приложений" — экспорт нескольких APK вместе с их выданными
/// runtime-разрешениями, чтобы поставить всё на другое устройство одним
/// кликом с теми же правами. Хранится как .zip: manifest.json + apks/*.apk.
struct AppBundleManifest: Codable {
    struct Entry: Codable {
        let packageName: String
        let apkFileName: String
        let versionName: String?
        /// Только runtime-разрешения, которые были выданы (isRuntime && granted) —
        /// install-time разрешения выдаются автоматически при установке, их
        /// незачем и нельзя восстанавливать через pm grant.
        let permissions: [String]
    }

    var exportedAt: Date
    var sourceDeviceModel: String?
    var entries: [Entry]

    static let manifestFileName = "manifest.json"
    static let apksSubdirectory = "apks"
}

struct BundleOperationResult: Identifiable {
    let id = UUID()
    let packageName: String
    let success: Bool
    let message: String
}
