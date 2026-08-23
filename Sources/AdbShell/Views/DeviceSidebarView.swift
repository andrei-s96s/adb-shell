import SwiftUI

struct DeviceSidebarView: View {
    @ObservedObject var vm: DevicesViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Логотип / заголовок
            VStack(alignment: .leading, spacing: 2) {
                Text("ADB // SHELL")
                    .font(CP.mono(18, weight: .heavy))
                    .cpTracking(1)
                    .foregroundColor(CP.yellow)
                Text("VOYAH DEVICE CONTROL")
                    .font(CP.mono(9, weight: .semibold))
                    .cpTracking(2.5)
                    .foregroundColor(CP.textMuted)
            }
            .padding(16)

            Rectangle().fill(CP.grid).frame(height: 1)

            // Устройства
            HStack {
                SectionLabel(text: "Устройства", accent: CP.cyan)
                Spacer()
                Button {
                    Task { await vm.refresh() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .rotationEffect(.degrees(vm.isRefreshing ? 360 : 0))
                        .foregroundColor(CP.cyan)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
            .padding(.bottom, 8)

            if vm.devices.isEmpty {
                Text("Поиск устройств…")
                    .font(CP.mono(11))
                    .foregroundColor(CP.textMuted)
                    .padding(.horizontal, 14)
            } else {
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(vm.devices) { device in
                            DeviceRow(device: device, isSelected: device.serial == vm.selectedSerial) {
                                vm.selectedSerial = device.serial
                            } disconnect: {
                                Task { await vm.disconnect(device) }
                            }
                        }
                    }
                    .padding(.horizontal, 10)
                }
            }

            Spacer()

            if let error = vm.errorMessage {
                Text(error)
                    .font(CP.mono(9))
                    .foregroundColor(CP.red)
                    .padding(10)
                    .lineLimit(3)
            }

            Rectangle().fill(CP.grid).frame(height: 1)

            // Подключение по сети
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: "Подключение по IP", accent: CP.magenta)
                HStack(spacing: 6) {
                    TextField("192.168.1.50:5555", text: $vm.connectHost)
                        .textFieldStyle(.plain)
                        .font(CP.mono(11))
                        .padding(6)
                        .background(CP.bgPanelAlt)
                        .overlay(Rectangle().stroke(CP.grid, lineWidth: 1))
                        .onSubmit { Task { await vm.connect() } }

                    Button {
                        Task { await vm.connect() }
                    } label: {
                        Text(vm.isConnecting ? "…" : "GO")
                    }
                    .buttonStyle(NeonButtonStyle(accent: CP.magenta, filled: true))
                    .disabled(vm.connectHost.trimmingCharacters(in: .whitespaces).isEmpty || vm.isConnecting)
                }
            }
            .padding(14)
        }
    }
}

private struct DeviceRow: View {
    let device: Device
    let isSelected: Bool
    let select: () -> Void
    let disconnect: () -> Void

    private var stateColor: Color {
        switch device.state {
        case .device: return CP.green
        case .unauthorized: return CP.yellow
        case .offline, .noPermissions: return CP.red
        case .unknown: return CP.textMuted
        }
    }

    var body: some View {
        Button(action: select) {
            HStack(spacing: 10) {
                StatusDot(color: stateColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text(device.displayName)
                        .font(CP.mono(12, weight: .semibold))
                        .foregroundColor(CP.textPrimary)
                        .lineLimit(1)
                    Text(device.isNetwork ? device.serial : "USB · \(device.state.label)")
                        .font(CP.mono(9))
                        .foregroundColor(CP.textMuted)
                        .lineLimit(1)
                }
                Spacer()
                if device.isNetwork {
                    Button(action: disconnect) {
                        Image(systemName: "xmark")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(CP.textMuted)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(10)
            .background(isSelected ? CP.yellow.opacity(0.12) : Color.clear)
            .overlay(
                Rectangle()
                    .stroke(isSelected ? CP.yellow : CP.grid, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
