import Foundation
import SwiftUI

@MainActor
final class FilesViewModel: ObservableObject {
    @Published var currentPath: String
    @Published var entries: [RemoteFile] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isBusy = false
    @Published var statusMessage: String?

    let service: ADBService

    init(service: ADBService, startPath: String = "/sdcard") {
        self.service = service
        self.currentPath = startPath
    }

    var breadcrumbs: [(name: String, path: String)] {
        let parts = currentPath.split(separator: "/").map(String.init)
        var acc = ""
        var crumbs: [(String, String)] = [("/", "/")]
        for part in parts {
            acc += "/" + part
            crumbs.append((part, acc))
        }
        return crumbs
    }

    func load(serial: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            entries = try await service.listDirectory(serial: serial, path: currentPath)
        } catch {
            errorMessage = error.localizedDescription
            entries = []
        }
    }

    func open(_ file: RemoteFile, serial: String) async {
        guard file.isDirectory else { return }
        currentPath = file.path
        await load(serial: serial)
    }

    func goUp(serial: String) async {
        guard currentPath != "/" else { return }
        let parent = (currentPath as NSString).deletingLastPathComponent
        currentPath = parent.isEmpty ? "/" : parent
        await load(serial: serial)
    }

    func goTo(_ path: String, serial: String) async {
        currentPath = path
        await load(serial: serial)
    }

    func makeDirectory(name: String, serial: String) async {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            try await service.makeDirectory(serial: serial, path: RemoteFile.joinPath(currentPath, trimmed))
            await load(serial: serial)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func delete(_ file: RemoteFile, serial: String) async {
        isBusy = true
        defer { isBusy = false }
        do {
            try await service.removeRemote(serial: serial, path: file.path, recursive: file.isDirectory)
            await load(serial: serial)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func pull(_ file: RemoteFile, to destinationDir: URL, serial: String) async {
        isBusy = true
        statusMessage = "Скачивание \(file.name)…"
        defer { isBusy = false }
        do {
            let localPath = destinationDir.appendingPathComponent(file.name).path
            try await service.pull(serial: serial, remotePath: file.path, localPath: localPath)
            statusMessage = "Скачано: \(localPath)"
        } catch {
            errorMessage = error.localizedDescription
            statusMessage = nil
        }
    }

    func push(urls: [URL], serial: String) async {
        isBusy = true
        defer { isBusy = false }
        for url in urls {
            statusMessage = "Загрузка \(url.lastPathComponent)…"
            do {
                let remotePath = RemoteFile.joinPath(currentPath, url.lastPathComponent)
                try await service.push(serial: serial, localPath: url.path, remotePath: remotePath)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        statusMessage = nil
        await load(serial: serial)
    }
}
