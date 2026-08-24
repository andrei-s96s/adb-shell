import Foundation

/// Разбор `aapt2 dump badging <apk>` — тот же вывод, что уже используется
/// IconService для извлечения пути к иконке, здесь вытаскиваем более полную сводку.
enum ApkBadgingParser {
    static func parse(_ output: String) -> ApkManifestInfo {
        var packageName: String?
        var versionName: String?
        var versionCode: String?
        var minSdk: String?
        var targetSdk: String?
        var applicationLabel: String?
        var permissions: [String] = []

        for line in output.split(separator: "\n") {
            if line.hasPrefix("package:") {
                packageName = attribute(in: line, name: "name")
                versionCode = attribute(in: line, name: "versionCode")
                versionName = attribute(in: line, name: "versionName")
            } else if line.hasPrefix("sdkVersion:") {
                minSdk = quotedValue(in: line)
            } else if line.hasPrefix("targetSdkVersion:") {
                targetSdk = quotedValue(in: line)
            } else if line.hasPrefix("application-label:") {
                applicationLabel = quotedValue(in: line)
            } else if line.hasPrefix("uses-permission:") {
                if let name = attribute(in: line, name: "name") {
                    permissions.append(name)
                }
            }
        }

        return ApkManifestInfo(
            packageName: packageName,
            versionName: versionName,
            versionCode: versionCode,
            minSdk: minSdk,
            targetSdk: targetSdk,
            applicationLabel: applicationLabel,
            permissions: permissions,
            rawBadging: output
        )
    }

    /// Значение вида `name='значение'` в произвольном месте строки.
    private static func attribute(in line: Substring, name: String) -> String? {
        guard let range = line.range(of: "\(name)='") else { return nil }
        let rest = line[range.upperBound...]
        guard let end = rest.firstIndex(of: "'") else { return nil }
        return String(rest[rest.startIndex..<end])
    }

    /// Значение вида `label:'значение'` сразу после первого двоеточия строки.
    private static func quotedValue(in line: Substring) -> String? {
        guard let colon = line.firstIndex(of: ":") else { return nil }
        let rest = line[line.index(after: colon)...]
        guard let firstQuote = rest.firstIndex(of: "'") else { return nil }
        let afterQuote = rest[rest.index(after: firstQuote)...]
        guard let end = afterQuote.firstIndex(of: "'") else { return nil }
        return String(afterQuote[afterQuote.startIndex..<end])
    }
}
