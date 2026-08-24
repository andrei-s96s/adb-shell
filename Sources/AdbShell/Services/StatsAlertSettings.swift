import Foundation

/// Ключи UserDefaults для пороговых уведомлений (CPU/батарея) — общие между
/// SettingsView (@AppStorage, для UI) и DeviceStatsViewModel (читает напрямую
/// через UserDefaults, т.к. это не View и @AppStorage там не работает).
enum StatsAlertSettings {
    static let enabledKey = "statsAlertsEnabled"
    static let cpuThresholdKey = "statsAlertCpuThreshold"
    static let batteryThresholdKey = "statsAlertBatteryThreshold"

    static func current(defaults: UserDefaults = .standard) -> (enabled: Bool, cpuThreshold: Double, batteryThreshold: Double) {
        let enabled = defaults.bool(forKey: enabledKey)
        let cpu = defaults.object(forKey: cpuThresholdKey) as? Double ?? 90
        let battery = defaults.object(forKey: batteryThresholdKey) as? Double ?? 15
        return (enabled, cpu, battery)
    }
}
