import Foundation

/// Разбор вывода трёх shell-команд, из которых собирается `DeviceStats`:
/// `dumpsys cpuinfo`, `cat /proc/meminfo` и `dumpsys battery`.
enum DeviceStatsParser {
    /// Строка "TOTAL" в `dumpsys cpuinfo` выглядит как "23% TOTAL: 12% user + ..."
    /// — берём число перед первым "% TOTAL".
    static func parseCpuPercent(_ output: String) -> Double? {
        for line in output.split(separator: "\n") {
            guard let range = line.range(of: "% TOTAL") else { continue }
            let prefix = line[line.startIndex..<range.lowerBound]
            let digits = prefix.trimmingCharacters(in: .whitespaces)
                .split(separator: " ").last.map(String.init) ?? String(prefix)
            if let value = Double(digits.trimmingCharacters(in: .whitespaces)) {
                return min(max(value, 0), 100)
            }
        }
        return nil
    }

    /// `/proc/meminfo`: используем MemTotal - MemAvailable (либо MemFree, если
    /// MemAvailable недоступен — на старых ядрах его может не быть).
    static func parseMemInfo(_ output: String) -> (usedKB: Int, totalKB: Int)? {
        var total: Int?
        var available: Int?
        var free: Int?
        for line in output.split(separator: "\n") {
            let parts = line.split(separator: ":")
            guard parts.count == 2 else { continue }
            let key = parts[0].trimmingCharacters(in: .whitespaces)
            let valueDigits = parts[1].trimmingCharacters(in: .whitespaces)
                .split(separator: " ").first.map(String.init)
            guard let valueDigits, let value = Int(valueDigits) else { continue }
            switch key {
            case "MemTotal": total = value
            case "MemAvailable": available = value
            case "MemFree": free = value
            default: break
            }
        }
        guard let total else { return nil }
        let used = total - (available ?? free ?? total)
        return (usedKB: max(used, 0), totalKB: total)
    }

    /// `dumpsys battery`: level/scale дают процент, temperature — в десятых долях °C,
    /// заряд определяем по status==2 (BATTERY_STATUS_CHARGING) либо по *_powered.
    static func parseBattery(_ output: String) -> (level: Int?, temperature: Double?, charging: Bool) {
        var level: Int?
        var scale: Int?
        var temperature: Double?
        var status: Int?
        var anyPowered = false

        for rawLine in output.split(separator: "\n") {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            guard let colon = line.firstIndex(of: ":") else { continue }
            let key = line[line.startIndex..<colon].trimmingCharacters(in: .whitespaces)
            let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            switch key {
            case "level": level = Int(value)
            case "scale": scale = Int(value)
            case "status": status = Int(value)
            case "temperature": temperature = Double(value).map { $0 / 10 }
            case "AC powered", "USB powered", "Wireless powered", "Dock powered":
                if value == "true" { anyPowered = true }
            default: break
            }
        }

        let percent = level.map { lvl -> Int in
            guard let scale, scale > 0, scale != 100 else { return lvl }
            return Int((Double(lvl) / Double(scale) * 100).rounded())
        }
        let charging = status == 2 || anyPowered
        return (level: percent, temperature: temperature, charging: charging)
    }

    static func parse(cpuOutput: String, memOutput: String, batteryOutput: String, timestamp: Date = Date()) -> DeviceStats {
        let mem = parseMemInfo(memOutput)
        let battery = parseBattery(batteryOutput)
        return DeviceStats(
            cpuPercent: parseCpuPercent(cpuOutput),
            memUsedKB: mem?.usedKB ?? 0,
            memTotalKB: mem?.totalKB ?? 0,
            batteryLevel: battery.level,
            batteryTemperature: battery.temperature,
            isCharging: battery.charging,
            timestamp: timestamp
        )
    }
}
