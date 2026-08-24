import Foundation
import SwiftUI

/// Управляет выбранным языком интерфейса (Системный / Русский / English).
/// Сам класс — @MainActor ObservableObject для реактивного UI (Picker и т.п.),
/// но фактическое чтение строк (свободная функция L(), см. ниже) идёт через
/// UserDefaults напрямую, без обращения к этому классу — так L() можно звать
/// откуда угодно, включая фоновые ветки ADBService, без конфликтов изоляции.
@MainActor
final class LocalizationManager: ObservableObject {
    enum Language: String, CaseIterable, Identifiable {
        case system, ru, en
        var id: String { rawValue }

        var label: String {
            switch self {
            case .system: return L("settings.language.system")
            case .ru: return "Русский"
            case .en: return "English"
            }
        }
    }

    static let shared = LocalizationManager()

    @Published var language: Language {
        didSet { UserDefaults.standard.set(language.rawValue, forKey: appLanguageDefaultsKey) }
    }

    private init() {
        let stored = UserDefaults.standard.string(forKey: appLanguageDefaultsKey).flatMap(Language.init(rawValue:))
        self.language = stored ?? .system
    }
}

/// Вне класса и без @MainActor, чтобы читаться из L() без конфликтов изоляции.
private let appLanguageDefaultsKey = "appLanguage"

/// Разрешает текущий язык в код "ru"/"en" — читает UserDefaults напрямую
/// (thread-safe для чтения/записи), не завязано на MainActor-изолированный
/// LocalizationManager, поэтому вызывается свободно из любого контекста.
private func resolvedLanguageCode() -> String {
    let stored = UserDefaults.standard.string(forKey: appLanguageDefaultsKey) ?? "system"
    switch stored {
    case "ru": return "ru"
    case "en": return "en"
    default:
        let preferred = Bundle.main.preferredLocalizations.first ?? Locale.preferredLanguages.first ?? "ru"
        return preferred.hasPrefix("en") ? "en" : "ru"
    }
}

private func localizationBundle() -> Bundle {
    let code = resolvedLanguageCode()
    guard let path = Bundle.module.path(forResource: code, ofType: "lproj"),
          let langBundle = Bundle(path: path) else {
        return Bundle.module
    }
    return langBundle
}

/// Локализованная строка по ключу. Свободная функция (не метод View), чтобы
/// её можно было звать и из ViewModel/Service — там нет доступа к environment,
/// и код может выполняться в фоновом потоке (см. ADBService.run).
func L(_ key: String) -> String {
    localizationBundle().localizedString(forKey: key, value: key, table: nil)
}

/// Версия с подстановкой аргументов (формат-строка вида "Установка %1$d/%2$d: %3$@").
func L(_ key: String, _ args: CVarArg...) -> String {
    String(format: L(key), arguments: args)
}
