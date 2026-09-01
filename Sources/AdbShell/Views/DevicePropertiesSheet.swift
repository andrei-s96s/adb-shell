import SwiftUI
import AppKit

/// Полный дамп системных свойств устройства (`adb shell getprop`) с поиском —
/// раньше getprop дёргался только точечно (пара свойств для версии/безопасности),
/// общего просмотра всех свойств не было.
struct DevicePropertiesSheet: View {
    let serial: String
    let service: ADBService
    let onClose: () -> Void

    @StateObject private var vm: DevicePropertiesViewModel

    init(serial: String, service: ADBService, onClose: @escaping () -> Void) {
        self.serial = serial
        self.service = service
        self.onClose = onClose
        _vm = StateObject(wrappedValue: DevicePropertiesViewModel(service: service))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                SectionLabel(text: L("deviceProps.title"), accent: CP.ice)
                Spacer()
                if !vm.properties.isEmpty {
                    Text(L("deviceProps.count", vm.filtered.count, vm.properties.count))
                        .font(CP.mono(10))
                        .foregroundColor(CP.textMuted)
                }
                Button(L("common.close")) { onClose() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
            }

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(CP.textMuted).font(.system(size: 11))
                TextField(L("deviceProps.search.placeholder"), text: $vm.searchText)
                    .textFieldStyle(.plain)
                    .font(CP.code(12))
            }
            .padding(9)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(CP.bgPanelAlt))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(CP.hairline, lineWidth: 1))

            if vm.isLoading {
                Spacer()
                ProgressView().tint(CP.gold)
                Spacer()
            } else if let error = vm.errorMessage {
                Spacer()
                Text(error).font(CP.mono(11)).foregroundColor(CP.crimson)
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(vm.filtered) { property in
                            propertyRow(property)
                            Rectangle().fill(CP.hairline).frame(height: 1)
                        }
                    }
                }
            }
        }
        .padding(20)
        .frame(width: 560, height: 560)
        .background(CP.bg)
        .task { await vm.load(serial: serial) }
    }

    private func propertyRow(_ property: DeviceProperty) -> some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(property.key).font(CP.code(11, weight: .medium)).foregroundColor(CP.ice)
                Text(property.value.isEmpty ? "—" : property.value)
                    .font(CP.code(11))
                    .foregroundColor(CP.textPrimary)
                    .textSelection(.enabled)
            }
            Spacer()
            Button {
                let pasteboard = NSPasteboard.general
                pasteboard.clearContents()
                pasteboard.setString("\(property.key)=\(property.value)", forType: .string)
            } label: {
                Image(systemName: "doc.on.doc").font(.system(size: 10)).foregroundColor(CP.textMuted)
            }
            .buttonStyle(.plain)
            .help(L("common.copy"))
        }
        .padding(.vertical, 6)
    }
}
