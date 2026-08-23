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
    @StateObject private var savedCommands = ShellHistoryStore()

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                SectionLabel(text: "Shell", accent: CP.rose)
                Spacer()
                Button("Скриншот") { Task { await takeScreenshot() } }
                    .buttonStyle(NeonButtonStyle(accent: CP.ice))
                Button("Reboot") { Task { try? await service.reboot(serial: serial) } }
                    .buttonStyle(NeonButtonStyle(accent: CP.crimson))
                Button("Очистить лог") { history.removeAll() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
            }
            .padding(16)

            if let screenshotMessage {
                Text(screenshotMessage)
                    .font(CP.mono(10))
                    .foregroundColor(CP.emerald)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
            }

            if !savedCommands.favorites.isEmpty {
                quickCommandsStrip
            }

            Rectangle().fill(CP.hairline).frame(height: 1)

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(history) { entry in
                            VStack(alignment: .leading, spacing: 4) {
                                Text("$ \(entry.command)")
                                    .font(CP.code(11, weight: .semibold))
                                    .foregroundColor(CP.gold)
                                Text(entry.output.isEmpty ? "(пусто)" : entry.output)
                                    .font(CP.code(10))
                                    .foregroundColor(entry.isError ? CP.crimson : CP.textPrimary)
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

            Rectangle().fill(CP.hairline).frame(height: 1)

            inputBar
        }
    }

    private var quickCommandsStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(savedCommands.favorites) { saved in
                    Button {
                        command = saved.text
                        Task { await run() }
                    } label: {
                        Text(saved.text)
                            .font(CP.code(10))
                            .lineLimit(1)
                    }
                    .buttonStyle(NeonButtonStyle(accent: CP.gold))
                    .contextMenu {
                        Button("Убрать из избранного") { savedCommands.toggleFavorite(saved.id) }
                        Button("Удалить", role: .destructive) { savedCommands.remove(saved.id) }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    private var inputBar: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text("adb shell")
                    .font(CP.mono(11, weight: .semibold))
                    .foregroundColor(CP.textMuted)
                TextField("pm list packages -3", text: $command)
                    .textFieldStyle(.plain)
                    .font(CP.code(12))
                    .onSubmit { Task { await run() } }

                Button {
                    savedCommands.favorite(command)
                } label: {
                    Image(systemName: "star")
                        .foregroundColor(CP.gold)
                }
                .buttonStyle(.plain)
                .disabled(command.trimmingCharacters(in: .whitespaces).isEmpty)
                .help("Добавить в избранное")

                Menu {
                    if savedCommands.recent.isEmpty {
                        Text("Пока пусто")
                    } else {
                        ForEach(savedCommands.recent) { saved in
                            Button(saved.text) {
                                command = saved.text
                                Task { await run() }
                            }
                        }
                    }
                } label: {
                    Image(systemName: "clock")
                        .foregroundColor(CP.textMuted)
                }
                .menuStyle(.borderlessButton)
                .frame(width: 22)

                if isRunning {
                    ProgressView().scaleEffect(0.6)
                } else {
                    Button("Выполнить") { Task { await run() } }
                        .buttonStyle(NeonButtonStyle(accent: CP.rose, filled: true))
                        .disabled(command.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .padding(12)
        }
        .background(CP.bgPanelAlt)
    }

    private func run() async {
        let cmd = command.trimmingCharacters(in: .whitespaces)
        guard !cmd.isEmpty else { return }
        isRunning = true
        command = ""
        defer { isRunning = false }
        savedCommands.record(cmd)
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
