import Foundation
import SwiftUI

@MainActor
final class LogcatViewModel: ObservableObject {
    @Published var lines: [LogLine] = []
    @Published var isStreaming = false
    @Published var filterText: String = ""
    @Published var minLevel: LogLevel = .verbose
    @Published var autoScroll = true

    private let service: ADBService
    private var session: LogcatSession?
    private let maxLines = 8000

    init(service: ADBService) {
        self.service = service
    }

    var filteredLines: [LogLine] {
        lines
            .filter { $0.level >= minLevel }
            .filter { filterText.isEmpty || $0.raw.localizedCaseInsensitiveContains(filterText) }
    }

    func start(serial: String) {
        guard !isStreaming else { return }
        let session = service.makeLogcatSession(serial: serial)
        self.session = session
        isStreaming = true
        session.start { [weak self] raw in
            guard let self else { return }
            Task { @MainActor in
                self.append(raw)
            }
        }
    }

    func stop() {
        session?.stop()
        session = nil
        isStreaming = false
    }

    func clear() {
        lines.removeAll()
    }

    func clearDeviceBufferAndScreen() {
        session?.clearDeviceBuffer()
        clear()
    }

    private func append(_ raw: String) {
        guard let parsed = LogLine.parse(raw) else { return }
        lines.append(parsed)
        if lines.count > maxLines {
            lines.removeFirst(lines.count - maxLines)
        }
    }
}
