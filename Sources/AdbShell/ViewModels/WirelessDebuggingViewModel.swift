import Foundation

@MainActor
final class WirelessDebuggingViewModel: ObservableObject {
    @Published var isWorking = false
    @Published var resultMessage: String?
    @Published var deviceIP: String?
    @Published var errorMessage: String?
    @Published var port: String = "5555"

    let service: ADBService

    init(service: ADBService) {
        self.service = service
    }

    func enable(serial: String) async {
        guard !isWorking else { return }
        isWorking = true
        errorMessage = nil
        resultMessage = nil
        deviceIP = nil
        defer { isWorking = false }

        let portNumber = Int(port) ?? 5555
        do {
            _ = try await service.enableWirelessDebugging(serial: serial, port: portNumber)
            // Устройство перезапускает adbd в TCP-режиме — небольшая пауза
            // перед чтением IP, чтобы не попасть в момент перезапуска.
            try? await Task.sleep(nanoseconds: 800_000_000)
            let ip = try? await service.deviceIPAddress(serial: serial)
            deviceIP = ip
            resultMessage = ip != nil
                ? L("wireless.enabled.withIP")
                : L("wireless.enabled.noIP")
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
