import SwiftUI

@main
struct AdbShellApp: App {
    @StateObject private var loc = LocalizationManager.shared
    @AppStorage(ThemePreference.defaultsKey) private var themePreferenceRaw = ThemePreference.dark.rawValue

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(loc)
                .preferredColorScheme((ThemePreference(rawValue: themePreferenceRaw) ?? .dark).colorScheme)
                .frame(minWidth: 1080, minHeight: 680)
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)
        .defaultSize(width: 1240, height: 760)
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandGroup(after: .toolbar) {
                Button(L("palette.menuTitle")) {
                    NotificationCenter.default.post(name: .openCommandPalette, object: nil)
                }
                .keyboardShortcut("k", modifiers: .command)
            }
        }
    }
}
