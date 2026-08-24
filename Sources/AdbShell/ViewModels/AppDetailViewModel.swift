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

    let service: ADBService

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
}
