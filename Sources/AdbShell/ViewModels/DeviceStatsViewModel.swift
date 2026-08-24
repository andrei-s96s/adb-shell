import Foundation

/// Опрашивает `ADBService.deviceStats` раз в 2 секунды, пока вкладка "Мониторинг"
/// видима, и держит скользящую историю точек для графиков.
@MainActor
final class DeviceStatsViewModel: ObservableObject {
    @Published var history: [DeviceStats] = []
    @Published var errorMessage: String?
    @Published var processes: [RunningProcess] = []
    @Published var killingPid: Int?
    @Published var securityFindings: [SecurityFinding] = []
    @Published var usageStats: [AppUsageStat] = []

    /// Сколько точек держим в истории — при интервале 2с это ~4 минуты графика.
    static let historyLimit = 120

    let service: ADBService
    private var pollTask: Task<Void, Never>?
    // Чтобы не слать уведомление на каждом тике, пока показатель держится
    // выше/ниже порога — только один раз при самом пересечении.
    private var cpuAlertArmed = true
    private var batteryAlertArmed = true

    init(service: ADBService) {
        self.service = service
    }

    var latest: DeviceStats? { history.last }

    func startPolling(serial: String) {
        stopPolling()
        history = []
        processes = []
        securityFindings = []
        usageStats = []
        errorMessage = nil
        cpuAlertArmed = true
        batteryAlertArmed = true
        pollTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                await self.poll(serial: serial)
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    private func poll(serial: String) async {
        do {
            let stats = try await service.deviceStats(serial: serial)
            errorMessage = nil
            history.append(stats)
            if history.count > Self.historyLimit {
                history.removeFirst(history.count - Self.historyLimit)
            }
            checkThresholds(stats)
        } catch {
            errorMessage = error.localizedDescription
        }
        // Список процессов дороже графиков — обновляем его тем же тиком, чтобы
        // не плодить второй параллельный poll-таск.
        if let list = try? await service.runningProcesses(serial: serial) {
            processes = list.sorted { ($0.rssKB ?? 0) > ($1.rssKB ?? 0) }
        }
    }

    /// Разовая проверка целостности устройства — свойства не меняются на лету,
    /// в отличие от CPU/памяти, поэтому не входит в общий poll-тик.
    func loadSecurityInfo(serial: String) async {
        guard let info = try? await service.securityInfo(serial: serial) else { return }
        securityFindings = DeviceSecurityAnalyzer.findings(for: info)
    }

    /// Однократное уведомление при пересечении порога (не на каждом тике, пока
    /// значение держится за порогом) — "взводится" заново, когда показатель
    /// возвращается в норму.
    private func checkThresholds(_ stats: DeviceStats) {
        let settings = StatsAlertSettings.current()
        guard settings.enabled else { return }

        if let cpu = stats.cpuPercent {
            if cpu >= settings.cpuThreshold, cpuAlertArmed {
                cpuAlertArmed = false
                NotificationService.notify(title: L("notify.alert.cpu.title"), body: L("notify.alert.cpu.body", Int(cpu)))
            } else if cpu < settings.cpuThreshold {
                cpuAlertArmed = true
            }
        }

        if let level = stats.batteryLevel, !stats.isCharging {
            if Double(level) <= settings.batteryThreshold, batteryAlertArmed {
                batteryAlertArmed = false
                NotificationService.notify(title: L("notify.alert.battery.title"), body: L("notify.alert.battery.body", level))
            } else if Double(level) > settings.batteryThreshold {
                batteryAlertArmed = true
            }
        }
    }

    /// Разовая загрузка экранного времени — как и security-info, не входит
    /// в частый poll-тик.
    func loadUsageStats(serial: String) async {
        guard let stats = try? await service.usageStats(serial: serial) else { return }
        usageStats = stats.sorted { $0.totalSeconds > $1.totalSeconds }
    }

    func kill(serial: String, pid: Int) async {
        killingPid = pid
        defer { killingPid = nil }
        do {
            try await service.killProcess(serial: serial, pid: pid)
            processes.removeAll { $0.pid == pid }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
