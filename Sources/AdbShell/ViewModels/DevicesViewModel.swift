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
    @Published private(set) var pinnedSerials: [String] = []
    @Published private(set) var mdnsDevices: [MdnsDevice] = []

    let service: ADBService
    private var pollTask: Task<Void, Never>?
    private var mdnsTask: Task<Void, Never>?
    /// Готовые устройства на прошлом опросе — чтобы отличить "уже было готово"
    /// от "только что стало готово" и не гонять автозапуск макросов на каждом тике.
    private var lastReadySerials: Set<String> = []

    var selectedDevice: Device? {
        devices.first { $0.serial == selectedSerial }
    }

    /// Закреплённые устройства (для быстрого переключения между несколькими
    /// одновременно подключёнными устройствами) — только те, что реально видны сейчас.
    var pinnedDevices: [Device] {
        pinnedSerials.compactMap { serial in devices.first { $0.serial == serial } }
    }

    func togglePin(_ serial: String) {
        if let idx = pinnedSerials.firstIndex(of: serial) {
            pinnedSerials.remove(at: idx)
        } else {
            pinnedSerials.append(serial)
        }
    }

    func isPinned(_ serial: String) -> Bool {
        pinnedSerials.contains(serial)
    }

    /// mDNS-находки, которые ещё не подключены как обычное устройство —
    /// иначе они дублировали бы уже видимую в списке запись.
    var undiscoveredMdnsDevices: [MdnsDevice] {
        let connectedSerials = Set(devices.map(\.serial))
        return mdnsDevices.filter { !connectedSerials.contains($0.address) }
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

    /// Периодический опрос mDNS в фоне — устройства с Wireless debugging
    /// сами появляются в сайдбаре, без ручного ввода IP. Молча игнорирует
    /// ошибки (например, если mdns-демон недоступен на этой машине).
    func startMdnsDiscovery() {
        stopMdnsDiscovery()
        mdnsTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                if let found = try? await self.service.discoverMdnsDevices() {
                    self.mdnsDevices = found
                }
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
        }
    }

    func stopMdnsDiscovery() {
        mdnsTask?.cancel()
        mdnsTask = nil
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
            triggerAutorunMacros(for: list)
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    /// Запускает макросы с автозапуском для устройств, которые только что стали
    /// готовыми (появились в списке или сменили состояние на "device"). Ошибки
    /// отдельных шагов макроса здесь не показываются пользователю — как и
    /// остальной автозапуск, это фоновая, best-effort операция.
    private func triggerAutorunMacros(for devices: [Device]) {
        let readyNow = Set(devices.filter { $0.state.isReady }.map(\.serial))
        defer { lastReadySerials = readyNow }
        let newlyReady = readyNow.subtracting(lastReadySerials)
        guard !newlyReady.isEmpty else { return }
        let autorunMacros = MacroStore.loadPersisted().filter { $0.autorunOnConnect }
        guard !autorunMacros.isEmpty else { return }
        for serial in newlyReady {
            for macro in autorunMacros {
                Task { await MacroRunner.run(macro, serial: serial, service: service, variables: [:]) { _ in } }
            }
        }
    }

    func connect() async {
        let host = connectHost.trimmingCharacters(in: .whitespaces)
        guard !host.isEmpty else { return }
        isConnecting = true
        defer { isConnecting = false }
        do {
            try await performConnect(host)
            connectHost = ""
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Подключение по адресу конкретного профиля (кнопка в списке профилей).
    func connect(to host: String) async {
        isConnecting = true
        defer { isConnecting = false }
        do {
            try await performConnect(host)
            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Best-effort автоподключение при старте — ошибки одного профиля не должны
    /// мешать остальным (устройство может быть выключено/недоступно).
    func autoConnect(profiles: [ConnectionProfile]) async {
        for profile in profiles {
            try? await performConnect(profile.host)
        }
        if !profiles.isEmpty { await refresh() }
    }

    private func performConnect(_ host: String) async throws {
        let normalized = host.contains(":") ? host : "\(host):5555"
        _ = try await service.connect(host: normalized)
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
