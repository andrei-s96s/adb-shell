import SwiftUI

enum MainTab: String, CaseIterable, Identifiable {
    case apps = "Приложения"
    case library = "APK библиотека"
    case shell = "Shell"
    var id: String { rawValue }
}

struct ContentView: View {
    @StateObject private var devicesVM: DevicesViewModel
    @State private var tab: MainTab = .apps

    init() {
        let service = ADBService()
        _devicesVM = StateObject(wrappedValue: DevicesViewModel(service: service))
    }

    private var readyDevice: Device? {
        let d = devicesVM.selectedDevice
        return (d?.state.isReady == true) ? d : nil
    }

    var body: some View {
        HStack(spacing: 0) {
            DeviceSidebarView(vm: devicesVM)
                .frame(width: 260)
                .background(CP.bgPanel)

            Rectangle().fill(CP.hairline).frame(width: 1)

            VStack(spacing: 0) {
                TopBar(tab: $tab, device: readyDevice)

                Rectangle().fill(CP.hairline).frame(height: 1)

                Group {
                    switch tab {
                    case .apps:
                        if let device = readyDevice {
                            AppsView(serial: device.serial, service: devicesVM.service)
                        } else {
                            NoDeviceView(hasAny: !devicesVM.devices.isEmpty)
                        }
                    case .library:
                        // Библиотека — локальная папка на Mac, устройство нужно только
                        // для кнопки "Установить", поэтому доступна всегда.
                        ApkLibraryView(serial: readyDevice?.serial, service: devicesVM.service)
                    case .shell:
                        if let device = readyDevice {
                            ShellRunnerView(serial: device.serial, service: devicesVM.service)
                        } else {
                            NoDeviceView(hasAny: !devicesVM.devices.isEmpty)
                        }
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
        HStack(spacing: 4) {
            HStack(spacing: 2) {
                ForEach(MainTab.allCases) { t in
                    Button {
                        tab = t
                    } label: {
                        Text(t.rawValue)
                            .font(CP.mono(12, weight: .semibold))
                            .foregroundColor(tab == t ? CP.textPrimary : CP.textMuted)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(
                                RoundedRectangle(cornerRadius: 7, style: .continuous)
                                    .fill(tab == t ? CP.bgPanelAlt : Color.clear)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(4)

            Spacer()

            if let device {
                HStack(spacing: 8) {
                    StatusDot(color: CP.emerald)
                    Text(device.displayName)
                        .font(CP.mono(11, weight: .medium))
                        .foregroundColor(CP.textMuted)
                }
                .padding(.trailing, 16)
            }
        }
        .frame(height: 44)
        .background(CP.bgPanel)
    }
}

private struct NoDeviceView: View {
    let hasAny: Bool
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "cable.connector.slash")
                .font(.system(size: 34, weight: .light))
                .foregroundColor(CP.textMuted)
            Text(hasAny ? "Выберите устройство" : "Нет подключённых устройств")
                .font(CP.mono(14, weight: .semibold))
                .foregroundColor(CP.textPrimary)
            Text(hasAny
                 ? "Кликните по устройству в списке слева"
                 : "Подключите устройство по USB или укажите IP для сетевого adb")
                .font(CP.mono(12))
                .foregroundColor(CP.textMuted)
        }
    }
}
