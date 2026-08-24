import SwiftUI
import AppKit
import UniformTypeIdentifiers

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
    @State private var isCapturingScreenshot = false
    @State private var screenshotData: Data?
    @State private var showScreenshotSheet = false
    @State private var mirrorMessage: String?
    @State private var broadcastMode = false
    @State private var textToSend = ""
    @State private var isSendingText = false
    @State private var showIntentTester = false
    @StateObject private var savedCommands = ShellHistoryStore()
    @StateObject private var mirror = ScreenMirrorService()
    @EnvironmentObject private var loc: LocalizationManager

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                SectionLabel(text: "Shell", accent: CP.rose)
                Spacer()
                if isCapturingScreenshot {
                    ProgressView().scaleEffect(0.6)
                } else {
                    Button(L("shell.screenshot")) { Task { await takeScreenshot() } }
                        .buttonStyle(NeonButtonStyle(accent: CP.ice))
                }

                if mirror.isRunning(serial) {
                    Label(L("shell.mirroring"), systemImage: "airplayvideo.fill")
                        .font(CP.mono(10))
                        .foregroundColor(CP.emerald)
                } else {
                    Button(L("shell.mirror")) { launchMirror() }
                        .buttonStyle(NeonButtonStyle(accent: CP.ice))
                    Button {
                        launchMirrorWithRecording()
                    } label: {
                        Image(systemName: "record.circle")
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(CP.crimson)
                    .help(L("shell.mirror.record.help"))
                }

                Button(L("shell.mirrorAll")) { Task { await launchMirrorGrid() } }
                    .buttonStyle(NeonButtonStyle(accent: CP.rose))
                    .help(L("shell.mirrorAll.help"))

                Button(L("shell.reboot")) { Task { try? await service.reboot(serial: serial) } }
                    .buttonStyle(NeonButtonStyle(accent: CP.crimson))

                Menu {
                    Button(L("shell.rebootRecovery")) { Task { try? await service.rebootToRecovery(serial: serial) } }
                    Button(L("shell.rebootBootloader")) { Task { try? await service.rebootToBootloader(serial: serial) } }
                    Divider()
                    Button("adb root") { Task { await runQuick("adb root") { try await service.rootAdb(serial: serial) } } }
                    Button("adb remount") { Task { await runQuick("adb remount") { try await service.remount(serial: serial) } } }
                    Divider()
                    Button(L("shell.intentTester")) { showIntentTester = true }
                } label: {
                    Text(L("shell.more"))
                }
                .menuStyle(.borderlessButton)
                .frame(width: 44)

                Button(L("shell.clearLog")) { history.removeAll() }
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

            if let mirrorMessage {
                Text(mirrorMessage)
                    .font(CP.mono(10))
                    .foregroundColor(CP.crimson)
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
                                Text(entry.output.isEmpty ? L("shell.emptyOutput") : entry.output)
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
        .id(loc.language)
        .sheet(isPresented: $showScreenshotSheet) {
            if let screenshotData {
                ScreenshotPreviewSheet(data: screenshotData) { showScreenshotSheet = false }
            }
        }
        .sheet(isPresented: $showIntentTester) {
            IntentTesterSheet(serial: serial, service: service) { showIntentTester = false }
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
                        Button(L("shell.removeFavorite")) { savedCommands.toggleFavorite(saved.id) }
                        Button(L("common.delete"), role: .destructive) { savedCommands.remove(saved.id) }
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
                Toggle(isOn: $broadcastMode) {
                    Text(L("shell.broadcast")).font(CP.mono(10, weight: .medium)).foregroundColor(CP.textMuted)
                }
                .toggleStyle(NeonToggleStyle(accent: CP.rose))
                .help(L("shell.broadcast.help"))

                Spacer()

                TextField(L("shell.sendText.placeholder"), text: $textToSend)
                    .textFieldStyle(.plain)
                    .font(CP.code(11))
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .frame(width: 200)
                    .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(CP.bgPanelAlt))
                    .onSubmit { Task { await sendText() } }
                if isSendingText {
                    ProgressView().scaleEffect(0.5)
                } else {
                    Button {
                        Task { await sendText() }
                    } label: {
                        Image(systemName: "keyboard")
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(CP.textMuted)
                    .disabled(textToSend.isEmpty)
                    .help(L("shell.sendText.help"))
                }
            }
            .padding(.horizontal, 12).padding(.top, 8)

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
                .help(L("shell.addFavorite.help"))

                Menu {
                    if savedCommands.recent.isEmpty {
                        Text(L("shell.historyEmpty"))
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
                    Button(L("shell.run")) { Task { await run() } }
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
        if broadcastMode {
            await runBroadcast(cmd)
        } else {
            do {
                let output = try await service.shell(serial: serial, command: cmd)
                history.append(HistoryEntry(command: cmd, output: output, isError: false))
            } catch {
                history.append(HistoryEntry(command: cmd, output: error.localizedDescription, isError: true))
            }
        }
    }

    /// Прогоняет команду по очереди на всех подключённых и готовых устройствах,
    /// собирая результат каждого в отдельную запись истории с префиксом serial.
    private func runBroadcast(_ cmd: String) async {
        let devices = (try? await service.listDevices())?.filter { $0.state.isReady } ?? []
        guard !devices.isEmpty else {
            history.append(HistoryEntry(command: cmd, output: L("shell.broadcast.noDevices"), isError: true))
            return
        }
        for device in devices {
            do {
                let output = try await service.shell(serial: device.serial, command: cmd)
                history.append(HistoryEntry(command: "[\(device.displayName)] \(cmd)", output: output, isError: false))
            } catch {
                history.append(HistoryEntry(command: "[\(device.displayName)] \(cmd)", output: error.localizedDescription, isError: true))
            }
        }
    }

    /// Логирует результат быстрых действий (adb root/remount) в ту же ленту, что и shell.
    private func runQuick(_ label: String, _ action: @escaping () async throws -> String) async {
        do {
            let output = try await action()
            history.append(HistoryEntry(command: label, output: output, isError: false))
        } catch {
            history.append(HistoryEntry(command: label, output: error.localizedDescription, isError: true))
        }
    }

    /// `input text` печатает в поле, у которого сейчас фокус на устройстве — это
    /// не буфер обмена (полноценно читать/писать системный clipboard устройства
    /// без root через adb нельзя), но для "напечатать пароль/URL в открытое поле"
    /// достаточно и куда надёжнее самодельного парсинга бинарного clipboard-парсела.
    private func sendText() async {
        let text = textToSend
        guard !text.isEmpty else { return }
        isSendingText = true
        defer { isSendingText = false }
        do {
            let output = try await service.shell(serial: serial, command: "input text \(ShellQuoting.singleQuoted(text))")
            history.append(HistoryEntry(command: "input text \(text)", output: output, isError: false))
            textToSend = ""
        } catch {
            history.append(HistoryEntry(command: "input text \(text)", output: error.localizedDescription, isError: true))
        }
    }

    private func launchMirror() {
        do {
            try mirror.launch(serial: serial, adbPath: service.adbPath)
            mirrorMessage = nil
        } catch {
            mirrorMessage = error.localizedDescription
        }
    }

    /// Зеркалирование с одновременной записью в .mp4 — scrcpy сам пишет файл
    /// по мере трансляции (--record), отдельного этапа "остановить и сохранить" нет,
    /// файл готов, как только окно scrcpy закрывается.
    private func launchMirrorWithRecording() {
        let panel = NSSavePanel()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd-HHmmss"
        panel.nameFieldStringValue = "adbshell-\(formatter.string(from: Date())).mp4"
        panel.allowedContentTypes = [UTType(filenameExtension: "mp4") ?? .data]
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try mirror.launch(serial: serial, adbPath: service.adbPath, recordPath: url.path)
            mirrorMessage = nil
        } catch {
            mirrorMessage = error.localizedDescription
        }
    }

    /// Зеркалирует все подключённые и готовые устройства разом, раскладывая
    /// окна scrcpy плиткой по экрану (см. ScreenMirrorService.launchGrid).
    private func launchMirrorGrid() async {
        let serials = (try? await service.listDevices())?.filter { $0.state.isReady }.map(\.serial) ?? []
        guard !serials.isEmpty else {
            mirrorMessage = L("shell.broadcast.noDevices")
            return
        }
        mirror.launchGrid(serials: serials, adbPath: service.adbPath)
    }

    private func takeScreenshot() async {
        isCapturingScreenshot = true
        defer { isCapturingScreenshot = false }
        do {
            let data = try await service.screenshot(serial: serial)
            screenshotData = data
            showScreenshotSheet = true
        } catch {
            screenshotMessage = L("shell.screenshotError", error.localizedDescription)
        }
    }
}

private struct ScreenshotPreviewSheet: View {
    let data: Data
    let onClose: () -> Void
    @State private var savedMessage: String?

    private var image: NSImage? { NSImage(data: data) }

    var body: some View {
        VStack(spacing: 14) {
            HStack {
                SectionLabel(text: L("shell.screenshot"), accent: CP.ice)
                Spacer()
                Button {
                    onClose()
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(CP.textMuted)
                }
                .buttonStyle(.plain)
            }

            if let image {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: 420, maxHeight: 420)
                    .background(CP.bgPanelAlt)
                    .cornerRadius(8)
            }

            if let savedMessage {
                Text(savedMessage).font(CP.mono(10)).foregroundColor(CP.emerald)
            }

            HStack(spacing: 8) {
                Button(L("shell.screenshot.copy")) {
                    let pasteboard = NSPasteboard.general
                    pasteboard.clearContents()
                    if let image { pasteboard.writeObjects([image]) }
                    savedMessage = L("shell.screenshot.copied")
                }
                .buttonStyle(NeonButtonStyle(accent: CP.textMuted))

                Button(L("shell.screenshot.saveAs")) {
                    let panel = NSSavePanel()
                    panel.nameFieldStringValue = "adbshell-screenshot-\(Int(Date().timeIntervalSince1970)).png"
                    panel.allowedContentTypes = [.png]
                    guard panel.runModal() == .OK, let url = panel.url else { return }
                    do {
                        try data.write(to: url)
                        savedMessage = L("shell.screenshotSaved", url.path)
                        NSWorkspace.shared.activateFileViewerSelecting([url])
                    } catch {
                        savedMessage = L("shell.screenshotError", error.localizedDescription)
                    }
                }
                .buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
            }
        }
        .padding(20)
        .frame(width: 460)
        .background(CP.bg)
    }
}
