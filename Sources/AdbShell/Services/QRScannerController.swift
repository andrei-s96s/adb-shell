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

    let session = AVCaptureSession()
    private var isConfigured = false

    func start() {
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
