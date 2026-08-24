import Foundation
import UserNotifications

/// Локальные macOS-уведомления о завершении долгих операций (пакетная
/// установка/удаление, установка на все устройства, экспорт наборов,
/// прогон макроса) — полезно, когда пользователь переключился на другое
/// приложение и не следит за прогрессом в окне.
///
/// Best-effort: разрешение запрашивается лениво при первом вызове, отказ
/// или ошибка просто означают отсутствие уведомления — не показываем это
/// как ошибку пользователю, операция всё равно уже выполнена.
@MainActor
enum NotificationService {
    private static var didRequestAuthorization = false

    static func notify(title: String, body: String) {
        // UNUserNotificationCenter.current() требует процесс с валидным bundle
        // identifier — у `swift run` (голый исполняемый файл без .app-обёртки,
        // см. README про запуск в режиме разработки) его нет, и вызов уронит
        // процесс. В собранном .app (build_app.sh) Info.plist есть всегда.
        guard Bundle.main.bundleIdentifier != nil else { return }
        let center = UNUserNotificationCenter.current()

        func post() {
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
            center.add(request)
        }

        guard !didRequestAuthorization else {
            post()
            return
        }
        didRequestAuthorization = true
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            post()
        }
    }
}
