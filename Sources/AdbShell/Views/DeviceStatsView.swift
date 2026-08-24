import SwiftUI
import Charts

/// Вкладка "Мониторинг": живые графики CPU/памяти устройства и текущее
/// состояние батареи, опрашиваются через ADBService.deviceStats раз в 2с.
struct DeviceStatsView: View {
    let serial: String
    let service: ADBService

    @StateObject private var vm: DeviceStatsViewModel
    @EnvironmentObject private var loc: LocalizationManager

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
                }

                Spacer(minLength: 20)
            }
            .padding(20)
            .id(loc.language)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .task(id: serial) {
            vm.startPolling(serial: serial)
        }
        .onDisappear { vm.stopPolling() }
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
