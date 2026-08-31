@preconcurrency import AVFoundation
import AppKit
import Foundation

/// Захват с камеры Mac + встроенное распознавание QR через AVCaptureMetadataOutput
/// (без Vision — metadata output сам умеет .qr, это самый простой и надёжный
/// путь). Декодирует ЛЮБОЙ QR в произвольную строку — не реализует официальный
/// протокол сопряжения Android (adb-tls-pairing по mDNS с паролем из QR, это
/// отдельный сетевой протокол, а не текстовая расшифровка), поэтому подходит
/// для QR, которые сами пользователи генерируют с host:port (стенды с
/// device farm и т.п.), а не для встроенного QR-сопряжения Android.
@MainActor
final class QRScannerController: NSObject, ObservableObject {
    @Published var scannedText: String?
    @Published var errorMessage: String?
    /// true, если разрешение уже отклонено — macOS не позволяет программно
    /// повторно показать системный алерт в этом случае (requestAccess его
    /// показывает только при .notDetermined), поэтому единственный честный
    /// путь — прямая ссылка в Настройки, а не повторный вызов requestAccess.
    @Published var isPermissionDenied = false

    // lazy — AVCaptureSession() must never be touched as a side effect of
    // merely constructing this controller. SwiftUI allocates a sheet's
    // @StateObject synchronously while presenting it, which can still be
    // nested inside the triggering button's own click-dispatch call stack;
    // see the comment in start() below for why that matters here.
    lazy var session = AVCaptureSession()
    private var isConfigured = false
    private var runtimeErrorToken: NSObjectProtocol?
    private var interruptionToken: NSObjectProtocol?

    deinit {
        if let runtimeErrorToken { NotificationCenter.default.removeObserver(runtimeErrorToken) }
        if let interruptionToken { NotificationCenter.default.removeObserver(interruptionToken) }
    }

    /// Открытие этого экрана стабильно крашило приложение глубоко внутри
    /// SwiftUI/Swift Concurrency рантайма (MainActor.assumeIsolated при
    /// диспетчеризации клика по кнопке) — именно на кнопке, открывающей это
    /// окно, и только на ней; это единственное место во всём приложении,
    /// трогающее AVFoundation. SwiftUI, судя по всему, успевает создать
    /// @StateObject этого шита (а значит и AVCaptureSession) ещё внутри
    /// того же call stack, что обрабатывает исходный клик — первое
    /// обращение к камере, вложенное так глубоко, похоже и было триггером.
    /// DispatchQueue.main.async здесь отдаёт control run loop'у и гарантирует,
    /// что AVFoundation трогается только из уже завершённого, свежего прохода
    /// — не как побочный эффект обработки самого клика.
    func start() {
        DispatchQueue.main.async { [weak self] in
            self?.startNow()
        }
    }

    private func startNow() {
        // Каждое открытие этого экрана создаёт новый QRScannerController
        // (это @StateObject самого шита), так что статус здесь всегда
        // читается заново, а не из кеша — например, после пересборки/
        // самообновления приложения (ad-hoc подпись меняется, macOS иногда
        // сбрасывает выданный ранее доступ к камере до .notDetermined) тут
        // же сработает ветка ниже и системный запрос покажется снова сам.
        isPermissionDenied = false
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureIfNeeded()
            runSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                Task { @MainActor in
                    guard let self else { return }
                    if granted {
                        self.configureIfNeeded()
                        self.runSession()
                    } else {
                        self.errorMessage = L("qrscan.noPermission")
                        self.isPermissionDenied = true
                    }
                }
            }
        default:
            // .denied/.restricted — requestAccess здесь уже НЕ покажет диалог
            // (Apple специально это запрещает), единственный путь для
            // пользователя — Настройки; см. openSystemSettings().
            errorMessage = L("qrscan.noPermission")
            isPermissionDenied = true
        }
    }

    func openSystemSettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera") else { return }
        NSWorkspace.shared.open(url)
    }

    func stop() {
        let session = session
        guard session.isRunning else { return }
        DispatchQueue.global(qos: .userInitiated).async {
            session.stopRunning()
        }
    }

    private func runSession() {
        guard isConfigured, !session.isRunning else { return }
        let session = session
        DispatchQueue.global(qos: .userInitiated).async {
            session.startRunning()
        }
    }

    private func configureIfNeeded() {
        guard !isConfigured else { return }
        guard let device = AVCaptureDevice.default(for: .video) else {
            errorMessage = L("qrscan.noCamera")
            return
        }
        let input: AVCaptureDeviceInput
        do {
            input = try AVCaptureDeviceInput(device: device)
        } catch {
            // Раньше эта ошибка проглатывалась через try? — превью молча
            // оставалось чёрным квадратом без единого намёка, что пошло не
            // так. Показываем реальный текст ошибки, чтобы это было видно.
            errorMessage = L("qrscan.inputError", error.localizedDescription)
            return
        }
        session.beginConfiguration()
        guard session.canAddInput(input) else {
            session.commitConfiguration()
            errorMessage = L("qrscan.inputRejected")
            return
        }
        session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else {
            session.commitConfiguration()
            errorMessage = L("qrscan.outputRejected")
            return
        }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        // .qr — практически универсально поддерживается встроенными камерами
        // Mac; availableMetadataObjectTypes до commitConfiguration() ещё не
        // гарантированно заполнен, поэтому не гейтим установку через него.
        output.metadataObjectTypes = [.qr]
        session.commitConfiguration()
        isConfigured = true
        observeSessionNotifications()
    }

    /// startRunning() выполняется на фоновой очереди и сам по себе ничего не
    /// бросает — если камера занята другим процессом или система прерывает
    /// сессию, AVFoundation сообщает об этом только через уведомления, не
    /// через ошибку вызова. Без этих обработчиков превью так и осталось бы
    /// молча чёрным при подобном сбое, как и было до этого фикса.
    private func observeSessionNotifications() {
        runtimeErrorToken = NotificationCenter.default.addObserver(
            forName: .AVCaptureSessionRuntimeError, object: session, queue: .main
        ) { [weak self] note in
            let underlying = (note.userInfo?[AVCaptureSessionErrorKey] as? Error)?.localizedDescription ?? "?"
            Task { @MainActor in self?.errorMessage = L("qrscan.runtimeError", underlying) }
        }
        interruptionToken = NotificationCenter.default.addObserver(
            forName: .AVCaptureSessionWasInterrupted, object: session, queue: .main
        ) { [weak self] _ in
            // AVCaptureSessionInterruptionReasonKey недоступен на macOS
            // (только iOS/iPadOS/Catalyst) — сам факт прерывания уже
            // полезнее, чем молчаливый чёрный квадрат.
            Task { @MainActor in self?.errorMessage = L("qrscan.interrupted") }
        }
    }
}

extension QRScannerController: AVCaptureMetadataOutputObjectsDelegate {
    // nonisolated: делегат объявлен не-actor-isolated в SDK, а конформанс
    // @MainActor-класса к нему должен быть явным, чтобы не гадать, как
    // компилятор согласует изоляцию через ObjC-мост — безопаснее прыгнуть
    // на MainActor явно, как и в остальных подобных местах в этом проекте.
    nonisolated func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              object.type == .qr,
              let value = object.stringValue else { return }
        Task { @MainActor in
            self.scannedText = value
        }
    }
}
