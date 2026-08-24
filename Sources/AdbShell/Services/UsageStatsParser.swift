import Foundation

/// Разбор `dumpsys usagestats` — недокументированный и версионно-нестабильный
/// формат (как и netstats detail). Отслеживает "текущий пакет" по строкам вида
/// `package: com.x` / `package=com.x` и подхватывает ближайшее к нему значение
/// длительности (`totalTimeUsed=`/`totalTimeVisible=`/`totalTime=`), которое
/// встречается либо числом в миллисекундах, либо строкой вида "1h23m45s566ms".
/// Best-effort: на устройстве/версии Android, где формат отличается, просто
/// вернёт пустой список, а не сломает вызывающую сторону.
enum UsageStatsParser {
    private static let packagePattern = try? NSRegularExpression(pattern: "package[=:]\\s*([\\w.]+)")
    private static let durationKeyPattern = try? NSRegularExpression(pattern: "totalTime(?:Used|Visible)?=(\\+?[\\w]+)")
    private static let durationComponentPattern = try? NSRegularExpression(pattern: "(\\d+)h|(\\d+)m(?!s)|(\\d+)s")

    static func parse(_ output: String) -> [AppUsageStat] {
        var currentPackage: String?
        var totals: [String: Int] = [:]
        var order: [String] = []

        for rawLine in output.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(rawLine)
            if let pkg = firstGroup(packagePattern, in: line) {
                currentPackage = pkg
                if !order.contains(pkg) { order.append(pkg) }
            }
            guard let pkg = currentPackage,
                  let rawDuration = firstGroup(durationKeyPattern, in: line),
                  let seconds = parseDurationToSeconds(rawDuration) else { continue }
            totals[pkg] = seconds
        }

        return order.compactMap { pkg in
            guard let seconds = totals[pkg], seconds > 0 else { return nil }
            return AppUsageStat(packageName: pkg, totalSeconds: seconds)
        }
    }

    static func parseDurationToSeconds(_ raw: String) -> Int? {
        var value = raw
        if value.hasPrefix("+") { value.removeFirst() }

        if let ms = Int(value) {
            return ms / 1000
        }

        guard let durationComponentPattern else { return nil }
        let range = NSRange(value.startIndex..., in: value)
        let matches = durationComponentPattern.matches(in: value, range: range)
        guard !matches.isEmpty else { return nil }

        var total = 0
        for match in matches {
            if let r = Range(match.range(at: 1), in: value), let h = Int(value[r]) { total += h * 3600 }
            if let r = Range(match.range(at: 2), in: value), let m = Int(value[r]) { total += m * 60 }
            if let r = Range(match.range(at: 3), in: value), let s = Int(value[r]) { total += s }
        }
        return total
    }

    private static func firstGroup(_ regex: NSRegularExpression?, in text: String) -> String? {
        guard let regex else { return nil }
        let range = NSRange(text.startIndex..., in: text)
        guard let match = regex.firstMatch(in: text, range: range), match.numberOfRanges > 1,
              let group = Range(match.range(at: 1), in: text) else { return nil }
        return String(text[group])
    }
}
