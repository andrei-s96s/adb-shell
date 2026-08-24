import AppKit

/// Глобальный хоткей ⌘⇧S — скриншот текущего выбранного устройства, работает
/// даже когда окно ADB Shell не в фокусе. Использует `NSEvent.addGlobalMonitorForEvents`,
/// который на macOS 10.15+ требует разрешения "Input Monitoring" (Настройки →
/// Конфиденциальность и безопасность → Мониторинг ввода) — без него монитор
/// просто не получает событий, без крэша, но и без эффекта, пока пользователь
/// не выдаст разрешение вручную (Info.plist тут ничего не решает, это
/// системный TCC-тумблер, не usage-description строка).
@MainActor
final class GlobalHotkeyService: ObservableObject {
    private var monitor: Any?

    func start(devicesVM: DevicesViewModel) {
        stop()
        monitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak devicesVM] event in
            guard event.modifierFlags.contains([.command, .shift]),
                  event.charactersIgnoringModifiers?.lowercased() == "s" else { return }
            guard let devicesVM else { return }
            Task { @MainActor in
                await Self.captureScreenshot(devicesVM: devicesVM)
            }
        }
    }

    func stop() {
        if let monitor {
            NSEvent.removeMonitor(monitor)
        }
        monitor = nil
    }

    private static func captureScreenshot(devicesVM: DevicesViewModel) async {
        guard let device = devicesVM.selectedDevice, device.state.isReady else { return }
        guard let data = try? await devicesVM.service.screenshot(serial: device.serial) else { return }

        let dir = FileManager.default.urls(for: .desktopDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd-HHmmss"
        let url = dir.appendingPathComponent("adbshell-screenshot-\(formatter.string(from: Date())).png")

        do {
            try data.write(to: url)
            NotificationService.notify(title: L("hotkey.screenshot.title"), body: L("hotkey.screenshot.body", url.lastPathComponent))
        } catch {
            NotificationService.notify(title: L("hotkey.screenshot.failedTitle"), body: error.localizedDescription)
        }
    }
}
