import Foundation

/// Сводка по манифесту APK, извлечённая из `aapt2 dump badging` — без установки
/// на устройство. Показывается в "Инфо" библиотеки APK.
struct ApkManifestInfo: Equatable {
    let packageName: String?
    let versionName: String?
    let versionCode: String?
    let minSdk: String?
    let targetSdk: String?
    let applicationLabel: String?
    let permissions: [String]
    /// Полный вывод aapt2 — на случай, если пользователю нужны детали, которые
    /// парсер не вытащил в отдельные поля.
    let rawBadging: String
}
