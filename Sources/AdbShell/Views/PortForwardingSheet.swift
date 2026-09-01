import SwiftUI

/// Управление пробросом портов adb: forward (Mac → устройство) и reverse
/// (устройство → Mac) — список активных правил + добавление/удаление, без
/// необходимости лезть в Shell вручную.
struct PortForwardingSheet: View {
    let serial: String
    let service: ADBService
    let onClose: () -> Void

    @StateObject private var vm: PortForwardingViewModel

    init(serial: String, service: ADBService, onClose: @escaping () -> Void) {
        self.serial = serial
        self.service = service
        self.onClose = onClose
        _vm = StateObject(wrappedValue: PortForwardingViewModel(service: service))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                SectionLabel(text: L("portForward.title"), accent: CP.ice)
                Spacer()
                Button(L("common.close")) { onClose() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
            }

            if let error = vm.errorMessage {
                Text(error).font(CP.mono(11)).foregroundColor(CP.crimson)
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    section(
                        title: L("portForward.forward.title"),
                        hint: L("portForward.forward.hint"),
                        accent: CP.emerald,
                        rules: vm.forwards,
                        firstLabel: L("portForward.host"),
                        firstBinding: $vm.newForwardHost,
                        secondLabel: L("portForward.device"),
                        secondBinding: $vm.newForwardDevice,
                        onAdd: { Task { await vm.addForward(serial: serial) } },
                        onRemove: { rule in Task { await vm.removeForward(rule, serial: serial) } },
                        rowText: { "\($0.hostSpec) → \($0.deviceSpec)" }
                    )

                    Rectangle().fill(CP.hairline).frame(height: 1)

                    section(
                        title: L("portForward.reverse.title"),
                        hint: L("portForward.reverse.hint"),
                        accent: CP.rose,
                        rules: vm.reverses,
                        firstLabel: L("portForward.device"),
                        firstBinding: $vm.newReverseDevice,
                        secondLabel: L("portForward.host"),
                        secondBinding: $vm.newReverseHost,
                        onAdd: { Task { await vm.addReverse(serial: serial) } },
                        onRemove: { rule in Task { await vm.removeReverse(rule, serial: serial) } },
                        rowText: { "\($0.deviceSpec) → \($0.hostSpec)" }
                    )
                }
            }
        }
        .padding(20)
        .frame(width: 480, height: 480)
        .background(CP.bg)
        .task { await vm.load(serial: serial) }
    }

    @ViewBuilder
    private func section(
        title: String,
        hint: String,
        accent: Color,
        rules: [PortForwardRule],
        firstLabel: String,
        firstBinding: Binding<String>,
        secondLabel: String,
        secondBinding: Binding<String>,
        onAdd: @escaping () -> Void,
        onRemove: @escaping (PortForwardRule) -> Void,
        rowText: @escaping (PortForwardRule) -> String
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: title, accent: accent)
            Text(hint).font(CP.mono(10)).foregroundColor(CP.textMuted)

            if rules.isEmpty {
                Text(L("portForward.empty")).font(CP.mono(11)).foregroundColor(CP.textMuted)
            } else {
                VStack(spacing: 6) {
                    ForEach(rules) { rule in
                        HStack {
                            Text(rowText(rule)).font(CP.code(12)).foregroundColor(CP.textPrimary).textSelection(.enabled)
                            Spacer()
                            Button {
                                onRemove(rule)
                            } label: {
                                Image(systemName: "xmark.circle").foregroundColor(CP.crimson)
                            }
                            .buttonStyle(.plain)
                            .disabled(vm.isWorking)
                        }
                        .padding(8)
                        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(CP.bgPanelAlt))
                    }
                }
            }

            HStack(spacing: 8) {
                TextField(firstLabel, text: firstBinding)
                    .textFieldStyle(.roundedBorder)
                    .font(CP.code(11))
                Text("→").foregroundColor(CP.textMuted)
                TextField(secondLabel, text: secondBinding)
                    .textFieldStyle(.roundedBorder)
                    .font(CP.code(11))
                Button(L("portForward.add")) { onAdd() }
                    .buttonStyle(NeonButtonStyle(accent: accent, filled: true))
                    .disabled(vm.isWorking || firstBinding.wrappedValue.trimmingCharacters(in: .whitespaces).isEmpty || secondBinding.wrappedValue.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }
}
