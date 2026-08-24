import Foundation

struct SecurityFinding: Equatable, Identifiable {
    enum Level: Equatable { case ok, warning, critical }

    var id: String { messageKey }
    let level: Level
    /// Ключ локализации — сам текст резолвится в UI через L(), чтобы эта логика
    /// оставалась чистой и тестируемой без обращения к Localizable.strings.
    let messageKey: String
}

/// Превращает сырые системные свойства (DeviceSecurityInfo) в список находок
/// с уровнем серьёзности — используется карточкой "Безопасность" во вкладке
/// "Мониторинг".
enum DeviceSecurityAnalyzer {
    static func findings(for info: DeviceSecurityInfo) -> [SecurityFinding] {
        var result: [SecurityFinding] = []

        switch info.verifiedBootState {
        case "green": result.append(SecurityFinding(level: .ok, messageKey: "security.verifiedBoot.green"))
        case "orange": result.append(SecurityFinding(level: .warning, messageKey: "security.verifiedBoot.orange"))
        case "yellow": result.append(SecurityFinding(level: .warning, messageKey: "security.verifiedBoot.yellow"))
        case "red": result.append(SecurityFinding(level: .critical, messageKey: "security.verifiedBoot.red"))
        default: break
        }

        if let locked = info.bootloaderLocked {
            result.append(SecurityFinding(
                level: locked ? .ok : .warning,
                messageKey: locked ? "security.bootloader.locked" : "security.bootloader.unlocked"
            ))
        }

        if info.suBinaryPresent {
            result.append(SecurityFinding(level: .critical, messageKey: "security.su.present"))
        }

        if info.isDebuggable {
            result.append(SecurityFinding(level: .warning, messageKey: "security.debuggable"))
        }

        if !info.isSecure {
            result.append(SecurityFinding(level: .critical, messageKey: "security.insecure"))
        }

        if info.playProtectConsent == "-1" {
            result.append(SecurityFinding(level: .warning, messageKey: "security.playProtect.disabled"))
        }

        if result.isEmpty {
            result.append(SecurityFinding(level: .ok, messageKey: "security.allClear"))
        }

        return result
    }
}
