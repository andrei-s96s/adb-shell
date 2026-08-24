import Foundation

/// Разбор `dumpsys netstats detail` — недокументированный формат, слегка
/// отличается между версиями Android (поля `rxBytes=`/`rb=`, `txBytes=`/`tb=`),
/// поэтому парсер намеренно толерантен: ищет блоки "uid=<uid> ..." и суммирует
/// все встретившиеся в блоке байты вплоть до следующего "uid=".
enum NetworkUsageParser {
    private static let uidPattern = try? NSRegularExpression(pattern: "uid=(\\d+)")
    private static let rxPattern = try? NSRegularExpression(pattern: "\\b(?:rxBytes|rb)=(\\d+)")
    private static let txPattern = try? NSRegularExpression(pattern: "\\b(?:txBytes|tb)=(\\d+)")

    static func parse(output: String, uid: Int) -> (rxBytes: Int64, txBytes: Int64) {
        var currentUid: Int?
        var rx: Int64 = 0
        var tx: Int64 = 0

        for line in output.split(separator: "\n", omittingEmptySubsequences: false) {
            let s = String(line)
            if let match = firstMatch(uidPattern, in: s), let value = Int(match) {
                currentUid = value
            }
            guard currentUid == uid else { continue }
            if let match = firstMatch(rxPattern, in: s), let value = Int64(match) {
                rx += value
            }
            if let match = firstMatch(txPattern, in: s), let value = Int64(match) {
                tx += value
            }
        }
        return (rx, tx)
    }

    private static func firstMatch(_ regex: NSRegularExpression?, in text: String) -> String? {
        guard let regex else { return nil }
        let range = NSRange(text.startIndex..., in: text)
        guard let match = regex.firstMatch(in: text, range: range), match.numberOfRanges > 1,
              let group = Range(match.range(at: 1), in: text) else { return nil }
        return String(text[group])
    }
}
