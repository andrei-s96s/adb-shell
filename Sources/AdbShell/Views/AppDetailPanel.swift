import SwiftUI

struct AppDetailPanel: View {
    let serial: String
    let service: ADBService
    let packageName: String
    let onChanged: () -> Void

    @StateObject private var vm: AppDetailViewModel
    @State private var showUninstallConfirm = false
    @State private var showClearConfirm = false

    init(serial: String, service: ADBService, packageName: String, onChanged: @escaping () -> Void) {
        self.serial = serial
        self.service = service
        self.packageName = packageName
        self.onChanged = onChanged
        _vm = StateObject(wrappedValue: AppDetailViewModel(service: service))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header

                if let error = vm.errorMessage {
                    Text(error)
                        .font(CP.mono(10))
                        .foregroundColor(CP.red)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(CP.red.opacity(0.08))
                        .overlay(Rectangle().stroke(CP.red.opacity(0.4), lineWidth: 1))
                }

                if vm.isLoading && vm.detail == nil {
                    ProgressView().tint(CP.yellow)
                } else if let detail = vm.detail {
                    infoGrid(detail)
                    actionButtons(detail)
                    permissionsSection(detail)
                }

                Spacer(minLength: 20)
            }
            .padding(20)
        }
        .task(id: packageName) {
            await vm.load(serial: serial, packageName: packageName)
        }
        .confirmationDialog("Удалить \(packageName)?", isPresented: $showUninstallConfirm, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) {
                Task {
                    if await vm.uninstall(serial: serial) { onChanged() }
                }
            }
            Button("Отмена", role: .cancel) { }
        }
        .confirmationDialog("Очистить данные \(packageName)?", isPresented: $showClearConfirm, titleVisibility: .visible) {
            Button("Очистить", role: .destructive) {
                Task { await vm.clearData(serial: serial) }
            }
            Button("Отмена", role: .cancel) { }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(packageName)
                .font(CP.mono(16, weight: .bold))
                .foregroundColor(CP.yellow)
                .textSelection(.enabled)
            if let v = vm.detail?.versionName {
                Text("v\(v)" + (vm.detail?.versionCode.map { " (\($0))" } ?? ""))
                    .font(CP.mono(11))
                    .foregroundColor(CP.textMuted)
            }
        }
    }

    private func infoGrid(_ detail: AppDetail) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel(text: "Информация", accent: CP.cyan)
            InfoLine(label: "Target SDK", value: detail.targetSdk ?? "—")
            InfoLine(label: "Установлено", value: shortDate(detail.firstInstallTime))
            InfoLine(label: "Обновлено", value: shortDate(detail.lastUpdateTime))
            InfoLine(label: "Путь", value: detail.apkPath ?? "—")
            InfoLine(label: "Состояние", value: detail.isEnabled ? "Включено" : "Отключено")
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cpPanel()
    }

    private func shortDate(_ raw: String?) -> String {
        guard let raw else { return "—" }
        // dumpsys отдаёт что-то вроде "2024-05-01 12:33:04"
        return raw.split(separator: ".").first.map(String.init) ?? raw
    }

    private func actionButtons(_ detail: AppDetail) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Действия", accent: CP.magenta)
            HStack(spacing: 8) {
                Button("Остановить") { Task { await vm.forceStop(serial: serial) } }
                    .buttonStyle(NeonButtonStyle(accent: CP.cyan))

                Button(detail.isEnabled ? "Отключить" : "Включить") {
                    Task { await vm.setEnabled(serial: serial, enabled: !detail.isEnabled) }
                }
                .buttonStyle(NeonButtonStyle(accent: CP.yellow))

                Button("Очистить данные") { showClearConfirm = true }
                    .buttonStyle(NeonButtonStyle(accent: CP.magenta))

                Button("Удалить") { showUninstallConfirm = true }
                    .buttonStyle(NeonButtonStyle(accent: CP.red, filled: true))
            }
            if vm.isPerformingAction {
                ProgressView().scaleEffect(0.6).tint(CP.yellow)
            }
            if let msg = vm.lastActionMessage {
                Text(msg).font(CP.mono(9)).foregroundColor(CP.green)
            }
        }
    }

    private func permissionsSection(_ detail: AppDetail) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: "Разрешения (\(detail.permissions.count))", accent: CP.yellow)
            if detail.permissions.isEmpty {
                Text("Нет запрошенных разрешений")
                    .font(CP.mono(10))
                    .foregroundColor(CP.textMuted)
            } else {
                VStack(spacing: 0) {
                    ForEach(detail.permissions) { perm in
                        PermissionRow(
                            permission: perm,
                            isBusy: vm.busyPermission == perm.name
                        ) {
                            Task { await vm.togglePermission(serial: serial, permission: perm) }
                        }
                        Rectangle().fill(CP.grid).frame(height: 1)
                    }
                }
                .cpPanel()
            }
        }
    }
}

private struct InfoLine: View {
    let label: String
    let value: String
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(label.uppercased())
                .font(CP.mono(9, weight: .semibold))
                .foregroundColor(CP.textMuted)
                .frame(width: 100, alignment: .leading)
            Text(value)
                .font(CP.mono(10))
                .foregroundColor(CP.textPrimary)
                .textSelection(.enabled)
                .lineLimit(2)
                .truncationMode(.middle)
            Spacer()
        }
    }
}

private struct PermissionRow: View {
    let permission: AppPermission
    let isBusy: Bool
    let toggle: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            StatusDot(color: permission.granted ? CP.green : CP.textMuted)
            VStack(alignment: .leading, spacing: 1) {
                Text(permission.shortName)
                    .font(CP.mono(11, weight: .semibold))
                    .foregroundColor(CP.textPrimary)
                Text(permission.name)
                    .font(CP.mono(8))
                    .foregroundColor(CP.textMuted)
                    .lineLimit(1)
                    .truncationMode(.head)
            }
            Spacer()

            if isBusy {
                ProgressView().scaleEffect(0.5)
            } else if permission.isRuntime {
                Button(permission.granted ? "ЗАБРАТЬ" : "ВЫДАТЬ") { toggle() }
                    .buttonStyle(NeonButtonStyle(accent: permission.granted ? CP.red : CP.green))
            } else {
                Text("АВТО")
                    .font(CP.mono(8, weight: .bold))
                    .foregroundColor(CP.textMuted)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
    }
}
