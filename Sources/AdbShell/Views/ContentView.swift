import SwiftUI

enum MainTab: String, CaseIterable, Identifiable {
    case apps = "ПРИЛОЖЕНИЯ"
    case library = "APK БИБЛИОТЕКА"
    case shell = "SHELL"
    var id: String { rawValue }
}

struct ContentView: View {
    @StateObject private var devicesVM: DevicesViewModel
    @State private var tab: MainTab = .apps

    init() {
        let service = ADBService()
        _devicesVM = StateObject(wrappedValue: DevicesViewModel(service: service))
    }

    var body: some View {
        HStack(spacing: 0) {
            DeviceSidebarView(vm: devicesVM)
                .frame(width: 260)
                .background(CP.bgPanel)

            Rectangle().fill(CP.grid).frame(width: 1)

            VStack(spacing: 0) {
                TopBar(tab: $tab, device: devicesVM.selectedDevice)

                Rectangle().fill(CP.grid).frame(height: 1)

                Group {
                    if let device = devicesVM.selectedDevice, device.state.isReady {
                        switch tab {
                        case .apps:
                            AppsView(serial: device.serial, service: devicesVM.service)
                        case .library:
                            ApkLibraryView(serial: device.serial, service: devicesVM.service)
                        case .shell:
                            ShellRunnerView(serial: device.serial, service: devicesVM.service)
                        }
                    } else {
                        NoDeviceView(hasAny: !devicesVM.devices.isEmpty)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(CP.bg)
        }
        .background(CP.bg)
        .foregroundColor(CP.textPrimary)
        .onAppear { devicesVM.startPolling() }
        .onDisappear { devicesVM.stopPolling() }
    }
}

private struct TopBar: View {
    @Binding var tab: MainTab
    let device: Device?

    var body: some View {
        HStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(MainTab.allCases) { t in
                    Button {
                        tab = t
                    } label: {
                        Text(t.rawValue)
                            .font(CP.mono(11, weight: .bold))
                            .cpTracking(1.5)
                            .foregroundColor(tab == t ? CP.bg : CP.textMuted)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background(tab == t ? CP.yellow : Color.clear)
                    }
                    .buttonStyle(.plain)
                }
            }

            Spacer()

            if let device {
                HStack(spacing: 8) {
                    StatusDot(color: CP.green)
                    Text(device.displayName.uppercased())
                        .font(CP.mono(11, weight: .semibold))
                        .foregroundColor(CP.textMuted)
                }
                .padding(.trailing, 16)
            }
        }
        .background(CP.bgPanelAlt)
    }
}

private struct NoDeviceView: View {
    let hasAny: Bool
    var body: some View {
        VStack(spacing: 14) {
            Text("⌁")
                .font(.system(size: 46))
                .foregroundColor(CP.yellow.opacity(0.8))
            Text(hasAny ? "ВЫБЕРИТЕ УСТРОЙСТВО" : "НЕТ ПОДКЛЮЧЁННЫХ УСТРОЙСТВ")
                .font(CP.mono(13, weight: .bold))
                .cpTracking(2)
                .foregroundColor(CP.textMuted)
            Text(hasAny
                 ? "Кликните по устройству в списке слева"
                 : "Подключите Voyah по USB или укажите IP для сетевого adb")
                .font(CP.mono(11))
                .foregroundColor(CP.textMuted.opacity(0.7))
        }
    }
}
