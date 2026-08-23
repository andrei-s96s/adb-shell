import SwiftUI
import AppKit

/// Настройки приложения. Хранятся через @AppStorage (UserDefaults) — для
/// личного инструмента этого достаточно, не нужен отдельный persistence-слой.
struct SettingsView: View {
    let onClose: () -> Void

    @AppStorage("autoCheckUpdates") private var autoCheckUpdates = true
    @AppStorage("defaultShowSystemApps") private var defaultShowSystemApps = false

    @StateObject private var apkLibrary = ApkLibraryViewModel()
    @StateObject private var shellHistory = ShellHistoryStore()
    @StateObject private var profiles = ConnectionProfileStore()
    @State private var clearedMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                SectionLabel(text: "Настройки", accent: CP.gold)
                Spacer()
                Button {
                    onClose()
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(CP.textMuted)
                }
                .buttonStyle(.plain)
            }

            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: "Обновления", accent: CP.ice)
                Toggle(isOn: $autoCheckUpdates) {
                    Text("Проверять обновления при запуске")
                        .font(CP.mono(12, weight: .medium))
                        .foregroundColor(CP.textPrimary)
                }
                .toggleStyle(NeonToggleStyle(accent: CP.gold))
                Text("Сейчас установлена версия v\(AppVersion.current)")
                    .font(CP.mono(10))
                    .foregroundColor(CP.textMuted)
            }
            .padding(12)
            .cpPanel()

            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: "Приложения", accent: CP.ice)
                Toggle(isOn: $defaultShowSystemApps) {
                    Text("Показывать системные приложения по умолчанию")
                        .font(CP.mono(12, weight: .medium))
                        .foregroundColor(CP.textPrimary)
                }
                .toggleStyle(NeonToggleStyle(accent: CP.gold))
            }
            .padding(12)
            .cpPanel()

            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: "Данные", accent: CP.rose)

                HStack {
                    Text(apkLibrary.directoryURL.path)
                        .font(CP.code(10))
                        .foregroundColor(CP.textMuted)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer()
                    Button("Показать в Finder") { apkLibrary.revealInFinder() }
                        .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
                }

                Divider().background(CP.hairline)

                HStack(spacing: 8) {
                    Button("Очистить историю shell") {
                        for item in shellHistory.recent { shellHistory.remove(item.id) }
                        clearedMessage = "История команд очищена"
                    }
                    .buttonStyle(NeonButtonStyle(accent: CP.crimson))

                    Button("Удалить профили подключения") {
                        for profile in profiles.profiles { profiles.remove(profile.id) }
                        clearedMessage = "Профили подключения удалены"
                    }
                    .buttonStyle(NeonButtonStyle(accent: CP.crimson))
                }

                if let clearedMessage {
                    Text(clearedMessage).font(CP.mono(10)).foregroundColor(CP.emerald)
                }
            }
            .padding(12)
            .cpPanel()

            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: "О программе", accent: CP.gold)
                Text("ADB Shell v\(AppVersion.current)")
                    .font(CP.mono(12, weight: .semibold))
                    .foregroundColor(CP.textPrimary)
                Button("Открыть репозиторий на GitHub") {
                    NSWorkspace.shared.open(URL(string: "https://github.com/andrei-s96s/adb-shell")!)
                }
                .buttonStyle(.plain)
                .font(CP.mono(11, weight: .medium))
                .foregroundColor(CP.ice)

                Button("История версий (Releases)") {
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
        .frame(width: 420, height: 560)
        .background(CP.bg)
    }
}
