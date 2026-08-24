import Foundation
import SwiftUI
import AppKit
import UniformTypeIdentifiers

@MainActor
final class AppDetailViewModel: ObservableObject {
    @Published var detail: AppDetail?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var busyPermission: String?
    @Published var isPerformingAction = false
    @Published var lastActionMessage: String?

    // Сетевой трафик приложения (best-effort, см. NetworkUsageParser).
    @Published var netRxRatePerSec: Double = 0
    @Published var netTxRatePerSec: Double = 0
    @Published var netTotalRxBytes: Int64 = 0
    @Published var netTotalTxBytes: Int64 = 0

    let service: ADBService
    private var netPollTask: Task<Void, Never>?
    private var lastNetSample: (rx: Int64, tx: Int64, at: Date)?

    init(service: ADBService) {
        self.service = service
    }

    func load(serial: String, packageName: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            detail = try await service.appDetail(serial: serial, packageName: packageName)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func togglePermission(serial: String, permission: AppPermission) async {
        guard let packageName = detail?.packageName else { return }
        busyPermission = permission.name
        defer { busyPermission = nil }
        do {
            if permission.granted {
                try await service.revokePermission(serial: serial, packageName: packageName, permission: permission.name)
            } else {
                try await service.grantPermission(serial: serial, packageName: packageName, permission: permission.name)
            }
            await load(serial: serial, packageName: packageName)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func uninstall(serial: String) async -> Bool {
        guard let packageName = detail?.packageName else { return false }
        isPerformingAction = true
        defer { isPerformingAction = false }
        do {
            try await service.uninstall(serial: serial, packageName: packageName)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func forceStop(serial: String) async {
        guard let packageName = detail?.packageName else { return }
        isPerformingAction = true
        defer { isPerformingAction = false }
        do {
            try await service.forceStop(serial: serial, packageName: packageName)
            lastActionMessage = L("appDetail.stopped")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func clearData(serial: String) async {
        guard let packageName = detail?.packageName else { return }
        isPerformingAction = true
        defer { isPerformingAction = false }
        do {
            try await service.clearData(serial: serial, packageName: packageName)
            lastActionMessage = L("appDetail.dataCleared")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func exportApk(serial: String) async {
        guard let packageName = detail?.packageName else { return }
        isPerformingAction = true
        defer { isPerformingAction = false }
        do {
            let paths = try await service.apkPaths(serial: serial, packageName: packageName)
            guard let basePath = paths.first(where: { $0.hasSuffix("base.apk") }) ?? paths.first else {
                errorMessage = L("error.apkPathNotFound")
                return
            }
            let panel = NSSavePanel()
            panel.nameFieldStringValue = "\(packageName).apk"
            panel.allowedContentTypes = [UTType(filenameExtension: "apk") ?? .data]
            guard panel.runModal() == .OK, let url = panel.url else { return }
            try await service.pull(serial: serial, remotePath: basePath, localPath: url.path)
            lastActionMessage = L("appDetail.apkExported", url.path)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setEnabled(serial: String, enabled: Bool) async {
        guard let packageName = detail?.packageName else { return }
        isPerformingAction = true
        defer { isPerformingAction = false }
        do {
            try await service.setEnabled(serial: serial, packageName: packageName, enabled: enabled)
            await load(serial: serial, packageName: packageName)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Качает APK по прямой ссылке F-Droid и ставит — по клику, не сама:
    /// вызывается только из кнопки «Скачать и установить» в UI.
    func installFDroidUpdate(_ update: FDroidUpdateInfo, serial: String) async {
        isPerformingAction = true
        defer { isPerformingAction = false }
        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("fdroid-\(update.packageName)-\(update.latestVersionCode).apk")
        defer { try? FileManager.default.removeItem(at: tmp) }
        do {
            let (downloaded, response) = try await URLSession.shared.download(from: update.downloadURL)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                errorMessage = L("appDetail.fdroid.downloadFailed")
                return
            }
            if FileManager.default.fileExists(atPath: tmp.path) {
                try FileManager.default.removeItem(at: tmp)
            }
            try FileManager.default.moveItem(at: downloaded, to: tmp)
            _ = try await service.install(serial: serial, apkPath: tmp.path)
            lastActionMessage = L("appDetail.fdroid.installed", update.latestVersionName ?? "\(update.latestVersionCode)")
            await load(serial: serial, packageName: update.packageName)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Сетевой трафик

    func startNetworkPolling(serial: String) {
        stopNetworkPolling()
        guard let uid = detail?.uid else { return }
        netPollTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                await self.pollNetwork(serial: serial, uid: uid)
                try? await Task.sleep(nanoseconds: 3_000_000_000)
            }
        }
    }

    func stopNetworkPolling() {
        netPollTask?.cancel()
        netPollTask = nil
        lastNetSample = nil
        netRxRatePerSec = 0
        netTxRatePerSec = 0
    }

    private func pollNetwork(serial: String, uid: Int) async {
        // Второстепенная секция — ошибки здесь не затирают errorMessage основной панели.
        guard let usage = try? await service.networkUsage(serial: serial, uid: uid) else { return }
        let now = Date()
        netTotalRxBytes = usage.rxBytes
        netTotalTxBytes = usage.txBytes
        if let last = lastNetSample {
            let dt = now.timeIntervalSince(last.at)
            if dt > 0 {
                netRxRatePerSec = max(0, Double(usage.rxBytes - last.rx) / dt)
                netTxRatePerSec = max(0, Double(usage.txBytes - last.tx) / dt)
            }
        }
        lastNetSample = (usage.rxBytes, usage.txBytes, now)
    }
}
