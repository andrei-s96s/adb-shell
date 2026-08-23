import Foundation

struct InstalledApp: Identifiable, Hashable {
    var id: String { packageName }
    let packageName: String
    var isSystem: Bool
    var isEnabled: Bool
}

struct AppPermission: Identifiable, Hashable {
    var id: String { name }
    let name: String
    var granted: Bool
    var isRuntime: Bool

    var shortName: String {
        if let last = name.split(separator: ".").last {
            return String(last)
        }
        return name
    }
}

struct AppDetail {
    let packageName: String
    var versionName: String?
    var versionCode: String?
    var firstInstallTime: String?
    var lastUpdateTime: String?
    var targetSdk: String?
    var apkPath: String?
    var isEnabled: Bool
    var permissions: [AppPermission]
}
