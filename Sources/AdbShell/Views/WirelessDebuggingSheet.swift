import SwiftUI
import AppKit

/// Включает Wi-Fi отладку одной кнопкой (`adb tcpip`) на устройстве,
/// подключённом сейчас по USB (или уже по сети), и показывает IP:порт для
/// последующего `adb connect` — после чего USB можно отключать.
struct WirelessDebuggingSheet: View {
    let serial: String
    let service: ADBService
    let onClose: () -> Void

    @StateObject private var vm: WirelessDebuggingViewModel

    init(serial: String, service: ADBService, onClose: @escaping () -> Void) {
        self.serial = serial
        self.service = service
        self.onClose = onClose
        _vm = StateObject(wrappedValue: WirelessDebuggingViewModel(service: service))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                SectionLabel(text: L("wireless.title"), accent: CP.ice)
                Spacer()
                Button(L("common.close")) { onClose() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
            }

            Text(L("wireless.explain"))
                .font(CP.mono(11))
                .foregroundColor(CP.textMuted)

            HStack {
                Text(L("wireless.port")).font(CP.mono(11, weight: .medium)).foregroundColor(CP.textMuted)
                TextField("5555", text: $vm.port)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 80)
                    .font(CP.code(12))
                Spacer()
                Button {
                    Task { await vm.enable(serial: serial) }
                } label: {
                    if vm.isWorking {
                        ProgressView().scaleEffect(0.6).frame(maxWidth: .infinity)
                    } else {
                        Text(L("wireless.enableAction"))
                    }
                }
                .buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
                .disabled(vm.isWorking || vm.port.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            if let error = vm.errorMessage {
                Text(error).font(CP.mono(11)).foregroundColor(CP.crimson)
            }

            if let message = vm.resultMessage {
                VStack(alignment: .leading, spacing: 8) {
                    Text(message).font(CP.mono(12, weight: .medium)).foregroundColor(CP.emerald)
                    if let ip = vm.deviceIP {
                        HStack(spacing: 6) {
                            Text("\(ip):\(vm.port)")
                                .font(CP.code(14, weight: .semibold))
                                .foregroundColor(CP.textPrimary)
                                .textSelection(.enabled)
                            Button {
                                let pasteboard = NSPasteboard.general
                                pasteboard.clearContents()
                                pasteboard.setString("\(ip):\(vm.port)", forType: .string)
                            } label: {
                                Image(systemName: "doc.on.doc")
                                    .foregroundColor(CP.textMuted)
                            }
                            .buttonStyle(.plain)
                            .help(L("common.copy"))
                        }
                    } else {
                        Text(L("wireless.noIP.hint")).font(CP.mono(10)).foregroundColor(CP.textMuted)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(CP.emerald.opacity(0.1)))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(CP.emerald.opacity(0.35), lineWidth: 1))
            }

            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(width: 420, height: 300)
        .background(CP.bg)
    }
}
