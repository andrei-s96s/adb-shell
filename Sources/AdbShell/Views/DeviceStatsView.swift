import SwiftUI
import Charts
import AppKit
import UniformTypeIdentifiers

/// Вкладка "Мониторинг": живые графики CPU/памяти устройства и текущее
/// состояние батареи, опрашиваются через ADBService.deviceStats раз в 2с.
struct DeviceStatsView: View {
    let serial: String
    let service: ADBService

    @StateObject private var vm: DeviceStatsViewModel
    @EnvironmentObject private var loc: LocalizationManager
    @State private var processFilter = ""
    @State private var killTarget: RunningProcess?

    init(serial: String, service: ADBService) {
        self.serial = serial
        self.service = service
        _vm = StateObject(wrappedValue: DeviceStatsViewModel(service: service))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let error = vm.errorMessage {
                    Text(error)
                        .font(CP.mono(11))
                        .foregroundColor(CP.crimson)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(CP.crimson.opacity(0.08)))
                }

                if vm.history.isEmpty {
                    HStack(spacing: 8) {
                        ProgressView().scaleEffect(0.7).tint(CP.gold)
                        Text(L("stats.loading")).font(CP.mono(12)).foregroundColor(CP.textMuted)
                    }
                    .padding(.top, 20)
                } else {
                    HStack {
                        Spacer()
                        Button(L("stats.exportCsv")) { exportCSV() }
                            .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                    }
                    batteryStrip
                    metricChart(
                        title: L("stats.cpu"),
                        accent: CP.gold,
                        unit: "%",
                        values: vm.history.map { ($0.timestamp, $0.cpuPercent ?? 0) },
                        currentLabel: vm.latest?.cpuPercent.map { String(format: "%.0f%%", $0) } ?? "—"
                    )
                    metricChart(
                        title: L("stats.memory"),
                        accent: CP.ice,
                        unit: "%",
                        values: vm.history.map { ($0.timestamp, $0.memUsedPercent ?? 0) },
                        currentLabel: vm.latest?.memUsedPercent.map { String(format: "%.0f%%", $0) } ?? "—",
                        footnote: memFootnote
                    )
                    processesSection
                    securitySection
                }

                Spacer(minLength: 20)
            }
            .padding(20)
            .id(loc.language)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .task(id: serial) {
            vm.startPolling(serial: serial)
            await vm.loadSecurityInfo(serial: serial)
        }
        .onDisappear { vm.stopPolling() }
        .confirmationDialog(
            killTarget.map { L("stats.killConfirm", $0.name, String($0.pid)) } ?? "",
            isPresented: Binding(get: { killTarget != nil }, set: { if !$0 { killTarget = nil } }),
            titleVisibility: .visible
        ) {
            Button(L("stats.kill"), role: .destructive) {
                if let target = killTarget {
                    Task { await vm.kill(serial: serial, pid: target.pid) }
                }
                killTarget = nil
            }
            Button(L("common.cancel"), role: .cancel) { killTarget = nil }
        }
    }

    private var securitySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: L("security.title"), accent: CP.rose)
            if vm.securityFindings.isEmpty {
                HStack(spacing: 8) {
                    ProgressView().scaleEffect(0.6).tint(CP.gold)
                    Text(L("stats.loading")).font(CP.mono(11)).foregroundColor(CP.textMuted)
                }
            } else {
                VStack(spacing: 0) {
                    ForEach(vm.securityFindings) { finding in
                        HStack(spacing: 8) {
                            Image(systemName: icon(for: finding.level))
                                .foregroundColor(color(for: finding.level))
                                .font(.system(size: 12))
                            Text(L(finding.messageKey))
                                .font(CP.mono(11))
                                .foregroundColor(CP.textPrimary)
                            Spacer()
                        }
                        .padding(.horizontal, 10).padding(.vertical, 7)
                        Rectangle().fill(CP.hairline).frame(height: 1)
                    }
                }
                .cpPanel()
            }
        }
    }

    private func icon(for level: SecurityFinding.Level) -> String {
        switch level {
        case .ok: return "checkmark.shield"
        case .warning: return "exclamationmark.triangle"
        case .critical: return "xmark.shield"
        }
    }

    private func color(for level: SecurityFinding.Level) -> Color {
        switch level {
        case .ok: return CP.emerald
        case .warning: return CP.gold
        case .critical: return CP.crimson
        }
    }

    private var filteredProcesses: [RunningProcess] {
        guard !processFilter.isEmpty else { return vm.processes }
        let needle = processFilter.lowercased()
        return vm.processes.filter { $0.name.lowercased().contains(needle) || String($0.pid).contains(needle) }
    }

    private var processesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                SectionLabel(text: L("stats.processes", vm.processes.count), accent: CP.rose)
                Spacer()
                TextField(L("stats.processFilter"), text: $processFilter)
                    .textFieldStyle(.plain)
                    .font(CP.code(11))
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .frame(width: 180)
                    .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(CP.bgPanelAlt))
            }
            VStack(spacing: 0) {
                ForEach(filteredProcesses.prefix(60)) { process in
                    HStack(spacing: 10) {
                        Text(String(process.pid))
                            .font(CP.code(10)).foregroundColor(CP.textMuted)
                            .frame(width: 52, alignment: .leading)
                        Text(process.name)
                            .font(CP.code(11)).foregroundColor(CP.textPrimary)
                            .lineLimit(1).truncationMode(.middle)
                        Spacer()
                        Text(process.user)
                            .font(CP.code(10)).foregroundColor(CP.textMuted)
                        Text(process.rssKB.map { ByteCountFormatter.string(fromByteCount: Int64($0) * 1024, countStyle: .binary) } ?? "—")
                            .font(CP.code(10)).foregroundColor(CP.textMuted)
                            .frame(width: 64, alignment: .trailing)
                        Button {
                            killTarget = process
                        } label: {
                            if vm.killingPid == process.pid {
                                ProgressView().scaleEffect(0.5)
                            } else {
                                Image(systemName: "xmark.circle").foregroundColor(CP.crimson)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    Rectangle().fill(CP.hairline).frame(height: 1)
                }
            }
            .cpPanel()
        }
    }

    private func exportCSV() {
        let panel = NSSavePanel()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd-HHmmss"
        panel.nameFieldStringValue = "adbshell-stats-\(serial)-\(formatter.string(from: Date())).csv"
        panel.allowedContentTypes = [.commaSeparatedText]
        guard panel.runModal() == .OK, let url = panel.url else { return }

        let iso = ISO8601DateFormatter()
        var csv = "timestamp,cpu_percent,mem_used_percent,mem_used_kb,mem_total_kb,battery_level,battery_temperature_c,charging\n"
        for point in vm.history {
            let cpu = point.cpuPercent.map { String($0) } ?? ""
            let memPercent = point.memUsedPercent.map { String($0) } ?? ""
            let level = point.batteryLevel.map { String($0) } ?? ""
            let temp = point.batteryTemperature.map { String($0) } ?? ""
            csv += "\(iso.string(from: point.timestamp)),\(cpu),\(memPercent),\(point.memUsedKB),\(point.memTotalKB),\(level),\(temp),\(point.isCharging)\n"
        }
        try? csv.write(to: url, atomically: true, encoding: .utf8)
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }

    private var memFootnote: String? {
        guard let latest = vm.latest, latest.memTotalKB > 0 else { return nil }
        let usedMB = latest.memUsedKB / 1024
        let totalMB = latest.memTotalKB / 1024
        return "\(usedMB) / \(totalMB) MB"
    }

    private var batteryStrip: some View {
        let latest = vm.latest
        return HStack(spacing: 20) {
            HStack(spacing: 8) {
                Image(systemName: latest?.isCharging == true ? "battery.100.bolt" : "battery.75")
                    .foregroundColor(latest?.isCharging == true ? CP.emerald : CP.textMuted)
                Text(latest?.batteryLevel.map { "\($0)%" } ?? "—")
                    .font(CP.mono(15, weight: .semibold))
                    .foregroundColor(CP.textPrimary)
                if latest?.isCharging == true {
                    Text(L("stats.charging")).font(CP.mono(11)).foregroundColor(CP.emerald)
                }
            }
            if let temp = latest?.batteryTemperature {
                HStack(spacing: 6) {
                    Image(systemName: "thermometer.medium").foregroundColor(CP.rose)
                    Text(String(format: "%.1f°C", temp)).font(CP.mono(13, weight: .medium)).foregroundColor(CP.textPrimary)
                }
            }
            Spacer()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cpPanel()
    }

    private func metricChart(
        title: String,
        accent: Color,
        unit: String,
        values: [(Date, Double)],
        currentLabel: String,
        footnote: String? = nil
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                SectionLabel(text: title, accent: accent)
                Spacer()
                Text(currentLabel)
                    .font(CP.mono(13, weight: .semibold))
                    .foregroundColor(accent)
                if let footnote {
                    Text(footnote).font(CP.code(10)).foregroundColor(CP.textMuted)
                }
            }
            Chart(values, id: \.0) { point in
                AreaMark(
                    x: .value("t", point.0),
                    y: .value(unit, point.1)
                )
                .foregroundStyle(accent.opacity(0.18))
                LineMark(
                    x: .value("t", point.0),
                    y: .value(unit, point.1)
                )
                .foregroundStyle(accent)
                .interpolationMethod(.monotone)
            }
            .chartYScale(domain: 0...100)
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks(position: .leading, values: [0, 50, 100]) { _ in
                    AxisGridLine().foregroundStyle(CP.hairline)
                    AxisValueLabel().font(CP.code(9)).foregroundStyle(CP.textMuted)
                }
            }
            .frame(height: 110)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cpPanel()
    }
}
