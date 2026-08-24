import Foundation

/// Сверяет установленные пакеты с официальным каталогом F-Droid
/// (https://f-droid.org/api/v1/packages/<pkg>, документированный публичный
/// эндпоинт того же сайта, не скрейпинг) — только для приложений, у которых
/// F-Droid вообще есть сборка; для остальных эндпоинт просто отвечает 404,
/// это не ошибка. Ничего не ставит и не скачивает сам — только сообщает,
/// что есть более новая versionCode, дальше решает пользователь.
enum FDroidUpdateChecker {
    private struct PackagesResponse: Decodable {
        let packageName: String
        let suggestedVersionCode: Int?
        let packages: [PackageEntry]?

        struct PackageEntry: Decodable {
            let versionName: String?
            let versionCode: Int?
        }
    }

    /// nil = пакета нет в каталоге F-Droid, сеть недоступна, или установленная
    /// версия уже не старше самой свежей в каталоге.
    static func checkUpdate(packageName: String, installedVersionCode: Int) async -> FDroidUpdateInfo? {
        guard let url = URL(string: "https://f-droid.org/api/v1/packages/\(packageName)") else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 12
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }
        return parse(data: data, installedVersionCode: installedVersionCode)
    }

    /// Вынесено из checkUpdate в чистую функцию — сеть замокать в юнит-тестах
    /// нельзя, а разбор реального JSON-ответа проверить стоит.
    static func parse(data: Data, installedVersionCode: Int) -> FDroidUpdateInfo? {
        guard let decoded = try? JSONDecoder().decode(PackagesResponse.self, from: data) else { return nil }

        let suggestedCode = decoded.suggestedVersionCode
        let allCodes = (decoded.packages ?? []).compactMap(\.versionCode)
        guard let maxCode = ([suggestedCode].compactMap { $0 } + allCodes).max(), maxCode > installedVersionCode else {
            return nil
        }
        let name = decoded.packages?.first(where: { $0.versionCode == maxCode })?.versionName
        return FDroidUpdateInfo(
            packageName: decoded.packageName,
            installedVersionCode: installedVersionCode,
            latestVersionCode: maxCode,
            latestVersionName: name
        )
    }
}
