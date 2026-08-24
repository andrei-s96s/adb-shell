import Foundation

/// Найденное на F-Droid обновление для установленного пакета.
struct FDroidUpdateInfo: Identifiable, Equatable {
    var id: String { packageName }
    let packageName: String
    let installedVersionCode: Int
    let latestVersionCode: Int
    let latestVersionName: String?

    /// Официальный URL прямой сборки F-Droid: repo/<pkg>_<versionCode>.apk.
    var downloadURL: URL {
        URL(string: "https://f-droid.org/repo/\(packageName)_\(latestVersionCode).apk")!
    }

    var fdroidPageURL: URL {
        URL(string: "https://f-droid.org/packages/\(packageName)/")!
    }
}
