import Foundation

/// Локально сохранённый снапшот всех пользовательских приложений устройства
/// вместе с их выданными runtime-разрешениями — тот же .zip-формат, что и
/// "набор приложений" (AppBundleManifest), только берёт сразу все
/// приложения и хранится сам в локальном кэше приложения, без диалога
/// сохранения — чтобы можно было в один клик "перенести всё" на другое
/// устройство позже.
struct DeviceSnapshot: Identifiable, Hashable {
    var id: String { url.path }
    let url: URL
    let deviceLabel: String
    let appCount: Int
    let createdAt: Date

    private static let prefix = "AdbShell-Snapshot"

    /// Имя файла кодирует метку устройства и число приложений, чтобы список
    /// снапшотов можно было показать без распаковки каждого .zip — точные
    /// данные (versionName, разрешения по пакетам) всё равно берутся из
    /// manifest.json внутри архива в момент восстановления.
    static func makeFilename(deviceLabel: String, appCount: Int) -> String {
        let sanitized = sanitize(deviceLabel)
        let unique = String(UUID().uuidString.prefix(8))
        return "\(prefix)_\(sanitized)_\(appCount)apps_\(unique).zip"
    }

    static func parse(url: URL, createdAt: Date) -> DeviceSnapshot? {
        let base = url.deletingPathExtension().lastPathComponent
        let parts = base.components(separatedBy: "_")
        guard parts.count >= 3, parts[0] == prefix else { return nil }
        let label = parts[1].replacingOccurrences(of: "-", with: " ")
        let appCount = Int(parts[2].filter(\.isNumber)) ?? 0
        return DeviceSnapshot(url: url, deviceLabel: label, appCount: appCount, createdAt: createdAt)
    }

    private static func sanitize(_ s: String) -> String {
        var result = String(s.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) ? Character($0) : "-" })
        while result.contains("--") { result = result.replacingOccurrences(of: "--", with: "-") }
        result = result.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return result.isEmpty ? "device" : result
    }
}
