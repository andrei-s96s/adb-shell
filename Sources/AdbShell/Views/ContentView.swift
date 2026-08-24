import SwiftUI

enum MainTab: String, CaseIterable, Identifiable {
    case apps, library, files, logcat, shell, macros, stats
    var id: String { rawValue }

    var title: String {
        switch self {
        case .apps: return L("tab.apps")
        case .library: return L("tab.library")
        case .files: return L("tab.files")
        case .logcat: return "Logcat"
        case .shell: return "Shell"
        case .macros: return L("tab.macros")
        case .stats: return L("tab.stats")
        }
    }
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
                TopBar(tab: $tab, device: readyDevice, service: devicesVM.service)

                Rectangle().fill(CP.hairline).frame(height: 1)

                if !devicesVM.pinnedDevices.isEmpty {
                    PinnedTabsStrip(devices: devicesVM.pinnedDevices, selectedSerial: devicesVM.selectedSerial) { serial in
                        devicesVM.selectedSerial = serial
                    } onUnpin: { serial in
                        devicesVM.togglePin(serial)
                    }
                    Rectangle().fill(CP.hairline).frame(height: 1)
                }

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
                    case .files:
                        if let device = readyDevice {
                            FilesView(serial: device.serial, service: devicesVM.service)
                        } else {
                            NoDeviceView(hasAny: !devicesVM.devices.isEmpty)
                        }
                    case .logcat:
                        if let device = readyDevice {
                            LogcatView(serial: device.serial, service: devicesVM.service)
                        } else {
                            NoDeviceView(hasAny: !devicesVM.devices.isEmpty)
                        }
                    case .shell:
                        if let device = readyDevice {
                            ShellRunnerView(serial: device.serial, service: devicesVM.service)
                        } else {
                            NoDeviceView(hasAny: !devicesVM.devices.isEmpty)
                        }
                    case .macros:
                        if let device = readyDevice {
                            MacroView(serial: device.serial, service: devicesVM.service)
                        } else {
                            NoDeviceView(hasAny: !devicesVM.devices.isEmpty)
                        }
                    case .stats:
                        if let device = readyDevice {
                            DeviceStatsView(serial: device.serial, service: devicesVM.service)
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
    let service: ADBService
    @State private var fingerprint: String?
    @EnvironmentObject private var loc: LocalizationManager

    var body: some View {
        HStack(spacing: 4) {
            HStack(spacing: 2) {
                ForEach(MainTab.allCases) { t in
                    Button {
                        tab = t
                    } label: {
                        Text(t.title)
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
            .id(loc.language)

            Spacer()

            if let device {
                HStack(spacing: 8) {
                    StatusDot(color: CP.emerald)
                    Text(device.displayName)
                        .font(CP.mono(11, weight: .medium))
                        .foregroundColor(CP.textMuted)
                    if let fingerprint {
                        Text("· \(fingerprint)")
                            .font(CP.code(10))
                            .foregroundColor(CP.textMuted.opacity(0.7))
                    }
                }
                .padding(.trailing, 16)
            }
        }
        .frame(height: 44)
        .background(CP.bgPanel)
        .task(id: device?.serial) {
            fingerprint = nil
            guard let device else { return }
            fingerprint = try? await service.buildFingerprint(serial: device.serial)
        }
    }
}

/// Полоска закреплённых устройств — быстрое переключение между несколькими
/// одновременно подключёнными устройствами без похода в сайдбар.
private struct PinnedTabsStrip: View {
    let devices: [Device]
    let selectedSerial: String?
    let onSelect: (String) -> Void
    let onUnpin: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(devices) { device in
                    let isActive = device.serial == selectedSerial
                    HStack(spacing: 6) {
                        StatusDot(color: device.state.isReady ? CP.emerald : CP.crimson)
                        Text(device.displayName)
                            .font(CP.mono(11, weight: .medium))
                            .foregroundColor(isActive ? CP.textPrimary : CP.textMuted)
                            .lineLimit(1)
                        Button { onUnpin(device.serial) } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 8, weight: .semibold))
                                .foregroundColor(CP.textMuted)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(isActive ? CP.bgPanelAlt : Color.clear)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .stroke(isActive ? CP.gold.opacity(0.4) : CP.hairline, lineWidth: 1)
                    )
                    .contentShape(Rectangle())
                    .onTapGesture { onSelect(device.serial) }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
        .background(CP.bgPanel)
    }
}

private struct NoDeviceView: View {
    let hasAny: Bool
    @EnvironmentObject private var loc: LocalizationManager

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "cable.connector.slash")
                .font(.system(size: 34, weight: .light))
                .foregroundColor(CP.textMuted)
            Text(hasAny ? L("nodevice.select") : L("nodevice.none"))
                .font(CP.mono(14, weight: .semibold))
                .foregroundColor(CP.textPrimary)
            Text(hasAny ? L("nodevice.select.hint") : L("nodevice.none.hint"))
                .font(CP.mono(12))
                .foregroundColor(CP.textMuted)
        }
        .id(loc.language)
    }
}
