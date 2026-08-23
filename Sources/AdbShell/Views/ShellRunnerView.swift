import SwiftUI
import AppKit

private struct HistoryEntry: Identifiable {
    let id = UUID()
    let command: String
    let output: String
    let isError: Bool
}

struct ShellRunnerView: View {
    let serial: String
    let service: ADBService

    @State private var command: String = ""
    @State private var history: [HistoryEntry] = []
    @State private var isRunning = false
    @State private var screenshotMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                SectionLabel(text: "Shell", accent: CP.magenta)
                Spacer()
                Button("Скриншот") { Task { await takeScreenshot() } }
                    .buttonStyle(NeonButtonStyle(accent: CP.cyan))
                Button("Reboot") { Task { try? await service.reboot(serial: serial) } }
                    .buttonStyle(NeonButtonStyle(accent: CP.red))
                Button("Очистить лог") { history.removeAll() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
            }
            .padding(16)

            if let screenshotMessage {
                Text(screenshotMessage)
                    .font(CP.mono(9))
                    .foregroundColor(CP.green)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
            }

            Rectangle().fill(CP.grid).frame(height: 1)

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(history) { entry in
                            VStack(alignment: .leading, spacing: 4) {
                                Text("$ \(entry.command)")
                                    .font(CP.mono(11, weight: .bold))
                                    .foregroundColor(CP.yellow)
                                Text(entry.output.isEmpty ? "(пусто)" : entry.output)
                                    .font(CP.mono(10))
                                    .foregroundColor(entry.isError ? CP.red : CP.textPrimary)
                                    .textSelection(.enabled)
                            }
                            .id(entry.id)
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onChange(of: history.count) { _ in
                    if let last = history.last {
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
            }

            Rectangle().fill(CP.grid).frame(height: 1)

            HStack(spacing: 8) {
                Text("adb shell")
                    .font(CP.mono(11, weight: .bold))
                    .foregroundColor(CP.textMuted)
                TextField("pm list packages -3", text: $command)
                    .textFieldStyle(.plain)
                    .font(CP.mono(11))
                    .onSubmit { Task { await run() } }
                if isRunning {
                    ProgressView().scaleEffect(0.6)
                } else {
                    Button("Выполнить") { Task { await run() } }
                        .buttonStyle(NeonButtonStyle(accent: CP.magenta, filled: true))
                        .disabled(command.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .padding(12)
            .background(CP.bgPanelAlt)
        }
    }

    private func run() async {
        let cmd = command.trimmingCharacters(in: .whitespaces)
        guard !cmd.isEmpty else { return }
        isRunning = true
        command = ""
        defer { isRunning = false }
        do {
            let output = try await service.shell(serial: serial, command: cmd)
            history.append(HistoryEntry(command: cmd, output: output, isError: false))
        } catch {
            history.append(HistoryEntry(command: cmd, output: error.localizedDescription, isError: true))
        }
    }

    private func takeScreenshot() async {
        do {
            let data = try await service.screenshot(serial: serial)
            let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
                ?? FileManager.default.homeDirectoryForCurrentUser
            let name = "adbshell-screenshot-\(Int(Date().timeIntervalSince1970)).png"
            let url = downloads.appendingPathComponent(name)
            try data.write(to: url)
            screenshotMessage = "Сохранено: \(url.path)"
            NSWorkspace.shared.activateFileViewerSelecting([url])
        } catch {
            screenshotMessage = "Ошибка скриншота: \(error.localizedDescription)"
        }
    }
}
