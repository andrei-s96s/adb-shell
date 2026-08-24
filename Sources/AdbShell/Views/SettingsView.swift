import SwiftUI
import AppKit

/// Настройки приложения. Хранятся через @AppStorage (UserDefaults) — для
/// личного инструмента этого достаточно, не нужен отдельный persistence-слой.
struct SettingsView: View {
    let onClose: () -> Void

    @AppStorage("autoCheckUpdates") private var autoCheckUpdates = true
    @AppStorage("defaultShowSystemApps") private var defaultShowSystemApps = false
    @AppStorage(ThemePreference.defaultsKey) private var themePreferenceRaw = ThemePreference.dark.rawValue
    @AppStorage("globalScreenshotHotkeyEnabled") private var hotkeyEnabled = false
    @AppStorage(StatsAlertSettings.enabledKey) private var alertsEnabled = false
    @AppStorage(StatsAlertSettings.cpuThresholdKey) private var cpuThreshold: Double = 90
    @AppStorage(StatsAlertSettings.batteryThresholdKey) private var batteryThreshold: Double = 15
    @EnvironmentObject private var loc: LocalizationManager

    @StateObject private var apkLibrary = ApkLibraryViewModel()
    @StateObject private var shellHistory = ShellHistoryStore()
    @StateObject private var profiles = ConnectionProfileStore()
    @State private var clearedMessage: String?
    @State private var supportCopiedMessage: String?

    private let donateAddressBEP20 = "0xb4cd0e92c9deb10202d156bafe0405b204902241"

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                SectionLabel(text: L("settings.title"), accent: CP.gold)
                Spacer()
                Button {
                    onClose()
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(CP.textMuted)
                }
                .buttonStyle(.plain)
            }

            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: L("settings.language"), accent: CP.rose)
                Picker("", selection: $loc.language) {
                    ForEach(LocalizationManager.Language.allCases) { lang in
                        Text(lang.label).tag(lang)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }
            .padding(12)
            .cpPanel()

            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: L("settings.theme"), accent: CP.gold)
                Picker("", selection: $themePreferenceRaw) {
                    ForEach(ThemePreference.allCases) { theme in
                        Text(theme.label).tag(theme.rawValue)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }
            .padding(12)
            .cpPanel()

            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: L("settings.hotkey"), accent: CP.rose)
                Toggle(isOn: $hotkeyEnabled) {
                    Text(L("settings.hotkey.enable"))
                        .font(CP.mono(12, weight: .medium))
                        .foregroundColor(CP.textPrimary)
                }
                .toggleStyle(NeonToggleStyle(accent: CP.gold))
                Text(L("settings.hotkey.hint"))
                    .font(CP.code(9))
                    .foregroundColor(CP.textMuted.opacity(0.8))
            }
            .padding(12)
            .cpPanel()

            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: L("settings.updates"), accent: CP.ice)
                Toggle(isOn: $autoCheckUpdates) {
                    Text(L("settings.checkOnLaunch"))
                        .font(CP.mono(12, weight: .medium))
                        .foregroundColor(CP.textPrimary)
                }
                .toggleStyle(NeonToggleStyle(accent: CP.gold))
                Text(L("settings.currentVersion", AppVersion.current))
                    .font(CP.mono(10))
                    .foregroundColor(CP.textMuted)
            }
            .padding(12)
            .cpPanel()

            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: L("settings.apps"), accent: CP.ice)
                Toggle(isOn: $defaultShowSystemApps) {
                    Text(L("settings.showSystemAppsDefault"))
                        .font(CP.mono(12, weight: .medium))
                        .foregroundColor(CP.textPrimary)
                }
                .toggleStyle(NeonToggleStyle(accent: CP.gold))
            }
            .padding(12)
            .cpPanel()

            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: L("settings.alerts"), accent: CP.crimson)
                Toggle(isOn: $alertsEnabled) {
                    Text(L("settings.alerts.enable"))
                        .font(CP.mono(12, weight: .medium))
                        .foregroundColor(CP.textPrimary)
                }
                .toggleStyle(NeonToggleStyle(accent: CP.gold))
                if alertsEnabled {
                    HStack {
                        Text(L("settings.alerts.cpu", Int(cpuThreshold)))
                            .font(CP.mono(11)).foregroundColor(CP.textMuted)
                        Stepper("", value: $cpuThreshold, in: 50...100, step: 5).labelsHidden()
                    }
                    HStack {
                        Text(L("settings.alerts.battery", Int(batteryThreshold)))
                            .font(CP.mono(11)).foregroundColor(CP.textMuted)
                        Stepper("", value: $batteryThreshold, in: 5...50, step: 5).labelsHidden()
                    }
                    Text(L("settings.alerts.hint"))
                        .font(CP.code(9))
                        .foregroundColor(CP.textMuted.opacity(0.8))
                }
            }
            .padding(12)
            .cpPanel()

            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: L("settings.data"), accent: CP.rose)

                HStack {
                    Text(apkLibrary.directoryURL.path)
                        .font(CP.code(10))
                        .foregroundColor(CP.textMuted)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer()
                    Button(L("library.showInFinder")) { apkLibrary.revealInFinder() }
                        .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                }

                Divider().background(CP.hairline)

                HStack(spacing: 8) {
                    Button(L("settings.clearShellHistory")) {
                        for item in shellHistory.recent { shellHistory.remove(item.id) }
                        clearedMessage = L("settings.shellHistoryCleared")
                    }
                    .buttonStyle(NeonButtonStyle(accent: CP.crimson))

                    Button(L("settings.removeProfiles")) {
                        for profile in profiles.profiles { profiles.remove(profile.id) }
                        clearedMessage = L("settings.profilesRemoved")
                    }
                    .buttonStyle(NeonButtonStyle(accent: CP.crimson))
                }

                if let clearedMessage {
                    Text(clearedMessage).font(CP.mono(10)).foregroundColor(CP.emerald)
                }
            }
            .padding(12)
            .cpPanel()

            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: L("settings.support"), accent: CP.emerald)
                Text(L("settings.support.hint"))
                    .font(CP.mono(11))
                    .foregroundColor(CP.textMuted)

                HStack(alignment: .top, spacing: 12) {
                    if let qrImage = QRCode.image(from: donateAddressBEP20) {
                        Image(nsImage: qrImage)
                            .resizable()
                            .interpolation(.none)
                            .frame(width: 76, height: 76)
                            .padding(6)
                            .background(Color.white)
                            .cornerRadius(6)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text(donateAddressBEP20)
                            .font(CP.code(10))
                            .foregroundColor(CP.textPrimary)
                            .textSelection(.enabled)
                            .lineLimit(2)
                            .truncationMode(.middle)

                        Button(L("settings.support.copy")) {
                            let pasteboard = NSPasteboard.general
                            pasteboard.clearContents()
                            pasteboard.setString(donateAddressBEP20, forType: .string)
                            supportCopiedMessage = L("settings.support.copied")
                        }
                        .buttonStyle(NeonButtonStyle(accent: CP.emerald))

                        Button(L("settings.support.openPage")) {
                            NSWorkspace.shared.open(URL(string: "https://andrei-s96s.github.io/adb-shell/")!)
                        }
                        .buttonStyle(.plain)
                        .font(CP.mono(10, weight: .medium))
                        .foregroundColor(CP.ice)
                    }
                }

                if let supportCopiedMessage {
                    Text(supportCopiedMessage).font(CP.mono(10)).foregroundColor(CP.emerald)
                }
            }
            .padding(12)
            .cpPanel()

            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: L("settings.about"), accent: CP.gold)
                Text("ADB Shell v\(AppVersion.current)")
                    .font(CP.mono(12, weight: .semibold))
                    .foregroundColor(CP.textPrimary)
                Button(L("settings.openRepo")) {
                    NSWorkspace.shared.open(URL(string: "https://github.com/andrei-s96s/adb-shell")!)
                }
                .buttonStyle(.plain)
                .font(CP.mono(11, weight: .medium))
                .foregroundColor(CP.ice)

                Button(L("settings.releaseHistory")) {
                    NSWorkspace.shared.open(URL(string: "https://github.com/andrei-s96s/adb-shell/releases")!)
                }
                .buttonStyle(.plain)
                .font(CP.mono(11, weight: .medium))
                .foregroundColor(CP.ice)
            }
            .padding(12)
            .cpPanel()

            Spacer()
        }
        .padding(20)
        .frame(width: 420, height: 830)
        .background(CP.bg)
        .id(loc.language)
    }
}

#Preview("Settings — Dark") {
    SettingsView { }
        .environmentObject(LocalizationManager.shared)
        .preferredColorScheme(.dark)
}

#Preview("Settings — Light") {
    SettingsView { }
        .environmentObject(LocalizationManager.shared)
        .preferredColorScheme(.light)
}
