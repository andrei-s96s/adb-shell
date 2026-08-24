import Foundation

/// Парсинг текстового вывода `dumpsys package <pkg>` — формат неофициальный
/// и немного отличается между версиями Android, поэтому парсер намеренно
/// толерантен к отсутствующим секциям.
enum DumpsysParser {

    static func parseAppDetail(packageName: String, output: String) -> AppDetail {
        let lines = output.components(separatedBy: "\n")

        var versionName: String?
        var versionCode: String?
        var firstInstall: String?
        var lastUpdate: String?
        var targetSdk: String?
        var apkPath: String?
        var enabled = true
        var uid: Int?

        var requested: [String] = []
        var runtimeGrantedMap: [String: Bool] = [:]
        var installGrantedMap: [String: Bool] = [:]

        var section: Section = .none

        for rawLine in lines {
            let trimmed = rawLine.trimmingCharacters(in: .whitespaces)
            let indent = rawLine.prefix { $0 == " " }.count

            if let v = value(in: trimmed, key: "versionName=") { versionName = v }
            if let v = value(in: trimmed, key: "versionCode=") {
                versionCode = v.split(separator: " ").first.map(String.init) ?? v
            }
            if let v = value(in: trimmed, key: "firstInstallTime=") { firstInstall = v }
            if let v = value(in: trimmed, key: "lastUpdateTime=") { lastUpdate = v }
            if let v = value(in: trimmed, key: "targetSdk=") { targetSdk = v }
            if uid == nil, let v = value(in: trimmed, key: "userId=") { uid = Int(v) }
            if uid == nil, let v = value(in: trimmed, key: "appId=") { uid = Int(v) }
            if trimmed.hasPrefix("codePath=") {
                apkPath = value(in: trimmed, key: "codePath=")
            }
            if trimmed.hasPrefix("enabled=") {
                let v = value(in: trimmed, key: "enabled=") ?? "true"
                enabled = !(v == "false" || v == "0" || v.uppercased() == "COMPONENT_ENABLED_STATE_DISABLED" || v.uppercased() == "COMPONENT_ENABLED_STATE_DISABLED_USER")
            }

            // Определяем секцию по заголовку (без учёта отступа, как есть в dumpsys)
            if trimmed.hasPrefix("requested permissions:") {
                section = .requested
                continue
            } else if trimmed.hasPrefix("runtime permissions:") {
                section = .runtime
                continue
            } else if trimmed.hasPrefix("install permissions:") {
                section = .install
                continue
            } else if trimmed.hasSuffix(":") && indent <= 4 && !trimmed.isEmpty {
                // Любой другой заголовок секции верхнего уровня — выходим из текущей
                section = .none
                continue
            }

            guard !trimmed.isEmpty else { continue }

            switch section {
            case .requested:
                if trimmed.hasPrefix("android.permission") || trimmed.contains(".permission.") {
                    requested.append(trimmed)
                } else {
                    section = .none
                }
            case .runtime, .install:
                // Формат: "android.permission.CAMERA: granted=true, flags=[...]"
                guard let colonRange = trimmed.range(of: ": ") else { continue }
                let name = String(trimmed[trimmed.startIndex..<colonRange.lowerBound])
                let rest = String(trimmed[colonRange.upperBound...])
                if name.contains(".permission.") || name.hasPrefix("android.permission") {
                    let granted = rest.contains("granted=true")
                    if section == .runtime {
                        runtimeGrantedMap[name] = granted
                    } else {
                        installGrantedMap[name] = granted
                    }
                }
            case .none:
                break
            }
        }

        var permissionNames = Set(requested)
        permissionNames.formUnion(runtimeGrantedMap.keys)
        permissionNames.formUnion(installGrantedMap.keys)

        let permissions = permissionNames.map { name -> AppPermission in
            // Разрешение реально togglable через `pm grant/revoke` только если
            // Android перечислил его в секции "runtime permissions:". Всё, что
            // встретилось лишь в "install permissions:" или только в "requested
            // permissions:" — install-time (normal/signature), оно выдаётся
            // автоматически и pm revoke на нём просто падает с ошибкой.
            if let granted = runtimeGrantedMap[name] {
                return AppPermission(name: name, granted: granted, isRuntime: true)
            }
            let granted = installGrantedMap[name] ?? true
            return AppPermission(name: name, granted: granted, isRuntime: false)
        }.sorted { $0.name < $1.name }

        return AppDetail(
            packageName: packageName,
            versionName: versionName,
            versionCode: versionCode,
            firstInstallTime: firstInstall,
            lastUpdateTime: lastUpdate,
            targetSdk: targetSdk,
            apkPath: apkPath,
            isEnabled: enabled,
            permissions: permissions,
            uid: uid
        )
    }

    private enum Section: Equatable {
        case none, requested, runtime, install
    }

    private static func value(in line: String, key: String) -> String? {
        guard let range = line.range(of: key) else { return nil }
        return String(line[range.upperBound...]).trimmingCharacters(in: .whitespaces)
    }
}
