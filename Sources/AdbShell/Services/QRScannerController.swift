import AVFoundation
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

    // lazy — AVCaptureSession() must never be touched as a side effect of
    // merely constructing this controller. SwiftUI allocates a sheet's
    // @StateObject synchronously while presenting it, which can still be
    // nested inside the triggering button's own click-dispatch call stack;
    // see the comment in start() below for why that matters here.
    lazy var session = AVCaptureSession()
    private var isConfigured = false

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
                    }
                }
            }
        default:
            errorMessage = L("qrscan.noPermission")
        }
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
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device) else {
            errorMessage = L("qrscan.noCamera")
            return
        }
        session.beginConfiguration()
        if session.canAddInput(input) {
            session.addInput(input)
        }
        let output = AVCaptureMetadataOutput()
        if session.canAddOutput(output) {
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            // .qr — практически универсально поддерживается встроенными камерами
            // Mac; availableMetadataObjectTypes до commitConfiguration() ещё не
            // гарантированно заполнен, поэтому не гейтим установку через него.
            output.metadataObjectTypes = [.qr]
        }
        session.commitConfiguration()
        isConfigured = true
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
