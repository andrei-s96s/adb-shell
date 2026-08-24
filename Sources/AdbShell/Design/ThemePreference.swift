import SwiftUI

/// Явный выбор темы (не только "следовать системе") — раньше тема была
/// жёстко зашита в .dark, теперь это настройка. Дефолт остаётся .dark,
/// чтобы у существующих пользователей после обновления ничего не поменялось
/// без явного действия с их стороны.
enum ThemePreference: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }

    static let defaultsKey = "themePreference"

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }

    var label: String {
        switch self {
        case .system: return L("settings.theme.system")
        case .light: return L("settings.theme.light")
        case .dark: return L("settings.theme.dark")
        }
    }
}
