import Foundation
import SwiftUI

@MainActor
final class DevicesViewModel: ObservableObject {
    @Published var devices: [Device] = []
    @Published var selectedSerial: String?
    @Published var isRefreshing = false
    @Published var errorMessage: String?
    @Published var connectHost: String = ""
    @Published var isConnecting = false

    let service: ADBService
    private var pollTask: Task<Void, Never>?

    var selectedDevice: Device? {
        devices.first { $0.serial == selectedSerial }
    }

    init(service: ADBService) {
        self.service = service
    }

    func startPolling() {
        stopPolling()
        pollTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                await self.refresh(silent: true)
                try? await Task.sleep(nanoseconds: 3_000_000_000)
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    func refresh(silent: Bool = false) async {
        if !silent { isRefreshing = true }
        defer { if !silent { isRefreshing = false } }
        do {
            let list = try await service.listDevices()
            self.devices = list
            self.errorMessage = nil
            if selectedSerial == nil || !list.contains(where: { $0.serial == selectedSerial }) {
                selectedSerial = list.first(where: { $0.state.isReady })?.serial
            }
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    func connect() async {
        let host = connectHost.trimmingCharacters(in: .whitespaces)
        guard !host.isEmpty else { return }
        isConnecting = true
        defer { isConnecting = false }
        do {
            _ = try await service.connect(host: host.contains(":") ? host : "\(host):5555")
            connectHost = ""
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func disconnect(_ device: Device) async {
        guard device.isNetwork else { return }
        do {
            try await service.disconnect(serial: device.serial)
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
