import Foundation

/// Суммарное время на переднем плане для одного пакета, по данным
/// `dumpsys usagestats` — см. UsageStatsParser про формат.
struct AppUsageStat: Identifiable, Equatable {
    var id: String { packageName }
    let packageName: String
    let totalSeconds: Int

    var formattedDuration: String {
        let h = totalSeconds / 3600
        let m = (totalSeconds % 3600) / 60
        let s = totalSeconds % 60
        if h > 0 { return String(format: "%dh %02dm", h, m) }
        if m > 0 { return String(format: "%dm %02ds", m, s) }
        return "\(s)s"
    }
}
