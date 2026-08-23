import SwiftUI

struct DeviceSidebarView: View {
    @ObservedObject var vm: DevicesViewModel
    @StateObject private var updateVM = UpdateService()
    @StateObject private var profileStore = ConnectionProfileStore()
    @State private var showPairingSheet = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Отступ под кнопки светофора окна (hiddenTitleBar рисует их поверх контента)
            Color.clear.frame(height: 28)

            // Логотип / заголовок
            VStack(alignment: .leading, spacing: 3) {
                Text("ADB Shell")
                    .font(CP.mono(19, weight: .bold))
                    .foregroundColor(CP.textPrimary)
                Text("Android Device Control")
                    .font(CP.mono(11, weight: .medium))
                    .foregroundColor(CP.gold)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 18)

            Rectangle().fill(CP.hairline).frame(height: 1)

            // Устройства
            HStack {
                SectionLabel(text: "Устройства", accent: CP.ice)
                Spacer()
                Button {
                    Task { await vm.refresh() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(CP.textMuted)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 8)

            if vm.devices.isEmpty {
                Text("Поиск устройств…")
                    .font(CP.mono(12))
                    .foregroundColor(CP.textMuted)
                    .padding(.horizontal, 16)
            } else {
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(vm.devices) { device in
                            DeviceRow(device: device, isSelected: device.serial == vm.selectedSerial, isPinned: vm.isPinned(device.serial)) {
                                vm.selectedSerial = device.serial
                            } disconnect: {
                                Task { await vm.disconnect(device) }
                            } togglePin: {
                                vm.togglePin(device.serial)
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                }
            }

            Spacer()

            if let error = vm.errorMessage {
                Text(error)
                    .font(CP.mono(10))
                    .foregroundColor(CP.crimson)
                    .padding(10)
                    .lineLimit(3)
            }

            Rectangle().fill(CP.hairline).frame(height: 1)

            // Подключение по сети
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    SectionLabel(text: "Подключение по IP", accent: CP.rose)
                    Spacer()
                    Button {
                        showPairingSheet = true
                    } label: {
                        Image(systemName: "qrcode")
                            .font(.system(size: 11))
                            .foregroundColor(CP.textMuted)
                    }
                    .buttonStyle(.plain)
                    .help("Сопряжение по коду (Android 11+ Wireless debugging)")
                }
                HStack(spacing: 6) {
                    TextField("192.168.1.50:5555", text: $vm.connectHost)
                        .textFieldStyle(.plain)
                        .font(CP.code(11))
                        .padding(8)
                        .background(
                            RoundedRectangle(cornerRadius: 7, style: .continuous)
                                .fill(CP.bgPanelAlt)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 7, style: .continuous)
                                .stroke(CP.hairline, lineWidth: 1)
                        )
                        .onSubmit { Task { await vm.connect() } }

                    Button {
                        profileStore.add(name: vm.connectHost, host: vm.connectHost)
                    } label: {
                        Image(systemName: "plus.circle")
                    }
                    .buttonStyle(.plain)
                    .foregroundColor(CP.textMuted)
                    .disabled(vm.connectHost.trimmingCharacters(in: .whitespaces).isEmpty)
                    .help("Сохранить как профиль")

                    Button {
                        Task { await vm.connect() }
                    } label: {
                        Text(vm.isConnecting ? "…" : "Connect")
                    }
                    .buttonStyle(NeonButtonStyle(accent: CP.rose, filled: true))
                    .disabled(vm.connectHost.trimmingCharacters(in: .whitespaces).isEmpty || vm.isConnecting)
                }

                if !profileStore.profiles.isEmpty {
                    VStack(spacing: 4) {
                        ForEach(profileStore.profiles) { profile in
                            ProfileRow(profile: profile) {
                                Task { await vm.connect(to: profile.host) }
                            } toggleAuto: {
                                profileStore.toggleAutoConnect(profile.id)
                            } remove: {
                                profileStore.remove(profile.id)
                            }
                        }
                    }
                }
            }
            .padding(16)

            Rectangle().fill(CP.hairline).frame(height: 1)
            UpdateFooter(vm: updateVM)
        }
        .task {
            await vm.autoConnect(profiles: profileStore.autoConnectProfiles)
            await updateVM.checkForUpdates()
        }
        .sheet(isPresented: $showPairingSheet) {
            PairingSheet(service: vm.service) { showPairingSheet = false }
        }
    }
}

private struct PairingSheet: View {
    let service: ADBService
    let onClose: () -> Void

    @State private var pairHostPort = ""
    @State private var code = ""
    @State private var isPairing = false
    @State private var resultMessage: String?
    @State private var isError = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel(text: "Сопряжение по коду", accent: CP.rose)
            Text("Android 11+: Настройки → Для разработчиков → Отладка по Wi-Fi →\n«Сопряжение устройства с помощью кода». Введите то, что показано там.")
                .font(CP.mono(11))
                .foregroundColor(CP.textMuted)

            VStack(alignment: .leading, spacing: 6) {
                Text("IP:порт сопряжения").font(CP.mono(10, weight: .medium)).foregroundColor(CP.textMuted)
                TextField("192.168.1.50:37251", text: $pairHostPort)
                    .textFieldStyle(.roundedBorder)
                    .font(CP.code(12))
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Код сопряжения").font(CP.mono(10, weight: .medium)).foregroundColor(CP.textMuted)
                TextField("123456", text: $code)
                    .textFieldStyle(.roundedBorder)
                    .font(CP.code(12))
            }

            if let resultMessage {
                Text(resultMessage)
                    .font(CP.mono(11))
                    .foregroundColor(isError ? CP.crimson : CP.emerald)
            }

            HStack {
                Spacer()
                Button("Закрыть") { onClose() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                Button(isPairing ? "…" : "Сопрячь") { Task { await pair() } }
                    .buttonStyle(NeonButtonStyle(accent: CP.rose, filled: true))
                    .disabled(pairHostPort.trimmingCharacters(in: .whitespaces).isEmpty || code.trimmingCharacters(in: .whitespaces).isEmpty || isPairing)
            }
        }
        .padding(20)
        .frame(width: 380)
        .background(CP.bg)
    }

    private func pair() async {
        isPairing = true
        defer { isPairing = false }
        do {
            let output = try await service.pair(hostPort: pairHostPort.trimmingCharacters(in: .whitespaces), code: code.trimmingCharacters(in: .whitespaces))
            resultMessage = output.isEmpty ? "Сопряжено. Теперь подключитесь по IP:порту из «Подключение по IP»." : output
            isError = false
        } catch {
            resultMessage = error.localizedDescription
            isError = true
        }
    }
}

private struct ProfileRow: View {
    let profile: ConnectionProfile
    let connect: () -> Void
    let toggleAuto: () -> Void
    let remove: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Button(action: toggleAuto) {
                Image(systemName: profile.autoConnect ? "star.fill" : "star")
                    .font(.system(size: 10))
                    .foregroundColor(profile.autoConnect ? CP.gold : CP.textMuted)
            }
            .buttonStyle(.plain)
            .help("Автоподключение при запуске")

            VStack(alignment: .leading, spacing: 0) {
                Text(profile.name)
                    .font(CP.mono(10, weight: .medium))
                    .foregroundColor(CP.textPrimary)
                    .lineLimit(1)
                Text(profile.host)
                    .font(CP.code(9))
                    .foregroundColor(CP.textMuted)
                    .lineLimit(1)
            }
            Spacer()

            Button(action: connect) {
                Image(systemName: "bolt.fill")
                    .font(.system(size: 10))
                    .foregroundColor(CP.ice)
            }
            .buttonStyle(.plain)

            Button(action: remove) {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(CP.textMuted)
            }
            .buttonStyle(.plain)
        }
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous).fill(CP.bgPanelAlt)
        )
    }
}

private struct UpdateFooter: View {
    @ObservedObject var vm: UpdateService

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            switch vm.state {
            case .idle, .checking:
                HStack(spacing: 6) {
                    if case .checking = vm.state {
                        ProgressView().scaleEffect(0.5)
                    }
                    Text("v\(AppVersion.current)")
                        .font(CP.code(10))
                        .foregroundColor(CP.textMuted)
                    Spacer()
                    Button("Проверить обновления") { Task { await vm.checkForUpdates() } }
                        .buttonStyle(.plain)
                        .font(CP.mono(10, weight: .medium))
                        .foregroundColor(CP.textMuted)
                }

            case .upToDate:
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle").foregroundColor(CP.emerald)
                    Text("v\(AppVersion.current) — актуальная версия")
                        .font(CP.mono(10, weight: .medium))
                        .foregroundColor(CP.textMuted)
                }

            case .available(let version, let downloadURL, let releaseURL):
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.down.circle.fill").foregroundColor(CP.gold)
                        Text("Доступна версия v\(version)")
                            .font(CP.mono(11, weight: .semibold))
                            .foregroundColor(CP.gold)
                    }
                    HStack(spacing: 8) {
                        if vm.canSelfInstall {
                            Button("Обновить") { Task { await vm.downloadAndInstall(from: downloadURL) } }
                                .buttonStyle(NeonButtonStyle(accent: CP.gold, filled: true))
                        }
                        Button("Страница релиза") { vm.openReleasePage(releaseURL) }
                            .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                    }
                }

            case .downloading:
                HStack(spacing: 6) {
                    ProgressView().scaleEffect(0.5)
                    Text("Скачивание обновления…")
                        .font(CP.mono(10, weight: .medium))
                        .foregroundColor(CP.textMuted)
                }

            case .installing:
                HStack(spacing: 6) {
                    ProgressView().scaleEffect(0.5)
                    Text("Установка… приложение перезапустится")
                        .font(CP.mono(10, weight: .medium))
                        .foregroundColor(CP.textMuted)
                }

            case .error(let message):
                VStack(alignment: .leading, spacing: 4) {
                    Text(message)
                        .font(CP.mono(10))
                        .foregroundColor(CP.crimson)
                        .lineLimit(2)
                    Button("Повторить") { Task { await vm.checkForUpdates() } }
                        .buttonStyle(.plain)
                        .font(CP.mono(10, weight: .medium))
                        .foregroundColor(CP.textMuted)
                }
            }
        }
        .padding(16)
    }
}

private struct DeviceRow: View {
    let device: Device
    let isSelected: Bool
    let isPinned: Bool
    let select: () -> Void
    let disconnect: () -> Void
    let togglePin: () -> Void

    private var stateColor: Color {
        switch device.state {
        case .device: return CP.emerald
        case .unauthorized: return CP.gold
        case .offline, .noPermissions: return CP.crimson
        case .unknown: return CP.textMuted
        }
    }

    var body: some View {
        Button(action: select) {
            HStack(spacing: 10) {
                StatusDot(color: stateColor)
                VStack(alignment: .leading, spacing: 2) {
                    Text(device.displayName)
                        .font(CP.mono(13, weight: .medium))
                        .foregroundColor(CP.textPrimary)
                        .lineLimit(1)
                    Text(device.isNetwork ? device.serial : "USB · \(device.state.label)")
                        .font(CP.code(10))
                        .foregroundColor(CP.textMuted)
                        .lineLimit(1)
                }
                Spacer()
                Button(action: togglePin) {
                    Image(systemName: isPinned ? "pin.fill" : "pin")
                        .font(.system(size: 10))
                        .foregroundColor(isPinned ? CP.gold : CP.textMuted)
                }
                .buttonStyle(.plain)
                .help(isPinned ? "Открепить вкладку" : "Закрепить как вкладку для быстрого переключения")

                if device.isNetwork {
                    Button(action: disconnect) {
                        Image(systemName: "xmark")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(CP.textMuted)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(isSelected ? CP.bgPanelAlt : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .stroke(isSelected ? CP.gold.opacity(0.5) : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
