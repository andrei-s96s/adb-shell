import Foundation

/// Опрашивает `ADBService.deviceStats` раз в 2 секунды, пока вкладка "Мониторинг"
/// видима, и держит скользящую историю точек для графиков.
@MainActor
final class DeviceStatsViewModel: ObservableObject {
    @Published var history: [DeviceStats] = []
    @Published var errorMessage: String?

    /// Сколько точек держим в истории — при интервале 2с это ~4 минуты графика.
    static let historyLimit = 120

    let service: ADBService
    private var pollTask: Task<Void, Never>?

    init(service: ADBService) {
        self.service = service
    }

    var latest: DeviceStats? { history.last }

    func startPolling(serial: String) {
        stopPolling()
        history = []
        errorMessage = nil
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
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
