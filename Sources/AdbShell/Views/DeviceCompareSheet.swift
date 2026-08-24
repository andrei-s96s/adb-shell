import SwiftUI

/// Сравнение списков установленных пакетов текущего устройства с другим —
/// только по именам пакетов (см. PackageDiff), для быстрой проверки паритета
/// между двумя тестовыми устройствами.
struct DeviceCompareSheet: View {
    let serial: String
    let service: ADBService
    let onClose: () -> Void

    @StateObject private var vm: DeviceCompareViewModel

    init(serial: String, service: ADBService, onClose: @escaping () -> Void) {
        self.serial = serial
        self.service = service
        self.onClose = onClose
        _vm = StateObject(wrappedValue: DeviceCompareViewModel(service: service))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                SectionLabel(text: L("compare.title"), accent: CP.ice)
                Spacer()
                Button(L("common.close")) { onClose() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
            }

            HStack {
                Text(L("compare.otherDevice")).font(CP.mono(11, weight: .medium)).foregroundColor(CP.textMuted)
                Picker("", selection: $vm.selectedOtherSerial) {
                    ForEach(vm.otherDevices) { device in
                        Text(device.displayName).tag(Optional(device.serial))
                    }
                }
                .labelsHidden()
                .frame(maxWidth: 240)
                Spacer()
                Button(L("compare.run")) { Task { await vm.compare(currentSerial: serial) } }
                    .buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
                    .disabled(vm.selectedOtherSerial == nil || vm.isLoading)
            }

            if vm.isLoading {
                ProgressView().tint(CP.gold)
            } else if let error = vm.errorMessage {
                Text(error).font(CP.mono(11)).foregroundColor(CP.crimson)
            } else if vm.otherDevices.isEmpty {
                Text(L("compare.noOtherDevices")).font(CP.mono(12)).foregroundColor(CP.textMuted)
            } else if let result = vm.result {
                Text(L("compare.common", result.commonCount)).font(CP.mono(11)).foregroundColor(CP.textMuted)
                HStack(alignment: .top, spacing: 12) {
                    diffColumn(title: L("compare.onlyHere"), accent: CP.emerald, packages: result.onlyInA)
                    diffColumn(title: L("compare.onlyThere"), accent: CP.rose, packages: result.onlyInB)
                }
            } else {
                Text(L("compare.hint")).font(CP.mono(12)).foregroundColor(CP.textMuted)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(width: 560, height: 480)
        .background(CP.bg)
        .task { await vm.loadOtherDevices(excluding: serial) }
    }

    private func diffColumn(title: String, accent: Color, packages: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel(text: "\(title) (\(packages.count))", accent: accent)
            ScrollView {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(packages, id: \.self) { pkg in
                        Text(pkg).font(CP.code(10)).foregroundColor(CP.textPrimary).textSelection(.enabled)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(10)
        .cpPanel()
    }
}
