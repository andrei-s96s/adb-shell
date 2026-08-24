import Foundation

/// Один "снимок" нагрузки устройства — CPU/память/батарея на момент опроса.
/// Используется вкладкой "Мониторинг" для живых графиков.
struct DeviceStats: Equatable {
    /// Суммарная загрузка CPU в процентах (0...100), если удалось распарсить `dumpsys cpuinfo`.
    let cpuPercent: Double?
    let memUsedKB: Int
    let memTotalKB: Int
    let batteryLevel: Int?
    /// Температура батареи в градусах Цельсия.
    let batteryTemperature: Double?
    let isCharging: Bool
    let timestamp: Date

    var memUsedPercent: Double? {
        guard memTotalKB > 0 else { return nil }
        return Double(memUsedKB) / Double(memTotalKB) * 100
    }
}
