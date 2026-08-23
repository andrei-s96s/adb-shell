import Foundation

enum LogLevel: Int, Comparable {
    case verbose = 0
    case debug = 1
    case info = 2
    case warn = 3
    case error = 4
    case fatal = 5

    static func < (lhs: LogLevel, rhs: LogLevel) -> Bool { lhs.rawValue < rhs.rawValue }

    init?(letter: Character) {
        switch letter {
        case "V": self = .verbose
        case "D": self = .debug
        case "I": self = .info
        case "W": self = .warn
        case "E": self = .error
        case "F": self = .fatal
        default: return nil
        }
    }

    var label: String {
        switch self {
        case .verbose: return "V"
        case .debug: return "D"
        case .info: return "I"
        case .warn: return "W"
        case .error: return "E"
        case .fatal: return "F"
        }
    }
}

struct LogLine: Identifiable {
    let id = UUID()
    let raw: String
    let timestamp: String?
    let pid: String?
    let tid: String?
    let level: LogLevel
    let tag: String?
    let message: String

    /// Парсит строку `adb logcat -v threadtime`:
    /// "08-23 23:10:15.123  1234  1234 D ActivityManager: Some message"
    /// Строки, не подходящие под формат (заголовки буфера и т.п.), становятся
    /// обычным info-логом целиком в message — так поток не теряет данные.
    static func parse(_ line: String) -> LogLine? {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let scanner = Scanner(string: trimmed)
        scanner.charactersToBeSkipped = nil

        guard let datePart = scanner.scanUpToString(" "), scanner.scanString(" ") != nil,
              let timePart = scanner.scanUpToCharacters(from: .whitespaces), scanner.scanString(" ") != nil,
              datePart.contains("-"), timePart.contains(":") else {
            return LogLine(raw: trimmed, timestamp: nil, pid: nil, tid: nil, level: .info, tag: nil, message: trimmed)
        }

        _ = scanner.scanCharacters(from: .whitespaces)
        guard let pid = scanner.scanUpToCharacters(from: .whitespaces) else {
            return LogLine(raw: trimmed, timestamp: nil, pid: nil, tid: nil, level: .info, tag: nil, message: trimmed)
        }
        _ = scanner.scanCharacters(from: .whitespaces)
        guard let tid = scanner.scanUpToCharacters(from: .whitespaces) else {
            return LogLine(raw: trimmed, timestamp: nil, pid: nil, tid: nil, level: .info, tag: nil, message: trimmed)
        }
        _ = scanner.scanCharacters(from: .whitespaces)
        guard let levelToken = scanner.scanUpToCharacters(from: .whitespaces),
              levelToken.count == 1, let level = LogLevel(letter: levelToken.first!) else {
            return LogLine(raw: trimmed, timestamp: nil, pid: nil, tid: nil, level: .info, tag: nil, message: trimmed)
        }
        _ = scanner.scanCharacters(from: .whitespaces)

        let rest = String(trimmed[scanner.currentIndex...])
        var tag: String?
        var message = rest
        if let colonRange = rest.range(of: ": ") {
            tag = String(rest[rest.startIndex..<colonRange.lowerBound]).trimmingCharacters(in: .whitespaces)
            message = String(rest[colonRange.upperBound...])
        }

        return LogLine(
            raw: trimmed,
            timestamp: "\(datePart) \(timePart)",
            pid: pid,
            tid: tid,
            level: level,
            tag: tag,
            message: message
        )
    }
}
