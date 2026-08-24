import Foundation

/// Устройство, обнаруженное в локальной сети через `adb mdns services`
/// (Android 11+ Wireless debugging рекламирует себя по mDNS/Bonjour).
struct MdnsDevice: Identifiable, Hashable {
    var id: String { address }
    let name: String
    let type: String
    let address: String

    /// `_adb-tls-pairing._tcp` — экран "сопряжение по коду", нужен код.
    /// `_adb-tls-connect._tcp` — уже сопряжённое устройство, можно `adb connect` сразу.
    var needsPairing: Bool { type.contains("pairing") }
}

enum MdnsParser {
    /// Формат вывода `adb mdns services` — по одной службе на строку,
    /// поля разделены табуляцией: имя, тип записи, ip:port.
    /// Заголовочная строка "List of discovered mdns services" пропускается.
    static func parse(_ output: String) -> [MdnsDevice] {
        var devices: [MdnsDevice] = []
        for rawLine in output.split(separator: "\n", omittingEmptySubsequences: true) {
            let line = String(rawLine).trimmingCharacters(in: .whitespaces)
            guard !line.isEmpty, !line.lowercased().hasPrefix("list of discovered") else { continue }

            let parts = line.split(separator: "\t").map { $0.trimmingCharacters(in: .whitespaces) }
            guard parts.count >= 3 else { continue }
            let name = parts[0]
            let type = parts[1]
            let address = parts[2]
            guard address.contains(":"), !name.isEmpty else { continue }

            devices.append(MdnsDevice(name: name, type: type, address: address))
        }
        return devices
    }
}
