import Foundation

/// Парсинг вывода `adb forward --list` / `adb reverse --list`. Обе команды
/// печатают строки вида "<serial> <spec1> <spec2>" — просто в разном порядке
/// смысла столбцов: у forward это (local, remote), у reverse — (remote, local).
enum PortForwardParser {
    static func parseForwardList(_ output: String, serial: String) -> [PortForwardRule] {
        parseList(output, serial: serial) { col1, col2 in
            PortForwardRule(direction: .forward, hostSpec: col1, deviceSpec: col2)
        }
    }

    static func parseReverseList(_ output: String, serial: String) -> [PortForwardRule] {
        parseList(output, serial: serial) { col1, col2 in
            // adb reverse --list печатает "<serial> <remote> <local>" —
            // remote (на устройстве) первым, local (на Mac) вторым.
            PortForwardRule(direction: .reverse, hostSpec: col2, deviceSpec: col1)
        }
    }

    private static func parseList(
        _ output: String,
        serial: String,
        make: (String, String) -> PortForwardRule
    ) -> [PortForwardRule] {
        output.split(separator: "\n").compactMap { rawLine -> PortForwardRule? in
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            guard !line.isEmpty else { return nil }
            let parts = line.split(separator: " ").map(String.init)
            guard parts.count >= 3, parts[0] == serial else { return nil }
            return make(parts[1], parts[2])
        }
    }
}
