import SwiftUI

struct LogcatView: View {
    let serial: String
    let service: ADBService
    @StateObject private var vm: LogcatViewModel
    @EnvironmentObject private var loc: LocalizationManager

    init(serial: String, service: ADBService) {
        self.serial = serial
        self.service = service
        _vm = StateObject(wrappedValue: LogcatViewModel(service: service))
    }

    var body: some View {
        VStack(spacing: 0) {
            toolbar

            Rectangle().fill(CP.hairline).frame(height: 1)

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(vm.filteredLines) { line in
                            LogLineRow(line: line)
                                .id(line.id)
                        }
                    }
                    .padding(.vertical, 6)
                }
                .background(CP.bg)
                .onChange(of: vm.filteredLines.count) { _ in
                    guard vm.autoScroll, let last = vm.filteredLines.last else { return }
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
        }
        .id(loc.language)
        .task(id: serial) {
            vm.clear()
            vm.start(serial: serial)
        }
        .onDisappear { vm.stop() }
    }

    private var toolbar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                SectionLabel(text: "Logcat", accent: CP.ice)

                HStack(spacing: 6) {
                    StatusDot(color: vm.isStreaming ? CP.emerald : CP.textMuted)
                    Text(vm.isStreaming ? L("logcat.streaming") : L("logcat.stopped"))
                        .font(CP.mono(10, weight: .medium))
                        .foregroundColor(CP.textMuted)
                }

                Spacer()

                Text("\(vm.filteredLines.count) / \(vm.lines.count)")
                    .font(CP.mono(10))
                    .foregroundColor(CP.textMuted)

                Button(vm.isStreaming ? L("logcat.pause") : L("logcat.resume")) {
                    if vm.isStreaming { vm.stop() } else { vm.start(serial: serial) }
                }
                .buttonStyle(NeonButtonStyle(accent: CP.ice))

                Button(L("common.clear")) { vm.clearDeviceBufferAndScreen() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
            }

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 11))
                    .foregroundColor(CP.textMuted)
                TextField(L("logcat.filter.placeholder"), text: $vm.filterText)
                    .textFieldStyle(.plain)
                    .font(CP.code(11))

                Picker("", selection: $vm.minLevel) {
                    Text("Verbose").tag(LogLevel.verbose)
                    Text("Debug").tag(LogLevel.debug)
                    Text("Info").tag(LogLevel.info)
                    Text("Warn").tag(LogLevel.warn)
                    Text("Error").tag(LogLevel.error)
                }
                .pickerStyle(.menu)
                .frame(width: 110)

                Toggle(isOn: $vm.autoScroll) {
                    Text(L("logcat.autoScroll")).font(CP.mono(10, weight: .medium)).foregroundColor(CP.textMuted)
                }
                .toggleStyle(NeonToggleStyle(accent: CP.gold))
            }
            .padding(8)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous).fill(CP.bgPanelAlt)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(CP.hairline, lineWidth: 1)
            )
        }
        .padding(12)
        .background(CP.bgPanel)
    }
}

private struct LogLineRow: View {
    let line: LogLine

    private var levelColor: Color {
        switch line.level {
        case .verbose, .debug: return CP.textMuted
        case .info: return CP.ice
        case .warn: return CP.gold
        case .error, .fatal: return CP.crimson
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(line.level.label)
                .font(CP.code(10, weight: .bold))
                .foregroundColor(levelColor)
                .frame(width: 14)

            if let tag = line.tag {
                Text(tag)
                    .font(CP.code(10, weight: .medium))
                    .foregroundColor(CP.textMuted)
                    .lineLimit(1)
                    .frame(width: 140, alignment: .leading)
                    .truncationMode(.tail)
            }

            Text(line.message)
                .font(CP.code(11))
                .foregroundColor(levelColor == CP.crimson ? CP.crimson : CP.textPrimary)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 2)
        .background(line.level >= .error ? CP.crimson.opacity(0.06) : Color.clear)
    }
}
