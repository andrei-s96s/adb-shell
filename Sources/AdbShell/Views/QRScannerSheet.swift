import SwiftUI
import AppKit
import AVFoundation

/// Живой предпросмотр AVCaptureSession — тонкая обёртка над NSView с
/// AVCaptureVideoPreviewLayer, session уже настраивается и запускается
/// снаружи (QRScannerController), эта view только рисует кадры.
private final class CaptureVideoNSView: NSView {
    let previewLayer = AVCaptureVideoPreviewLayer()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        previewLayer.videoGravity = .resizeAspectFill
        layer = previewLayer
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}

private struct CameraPreview: NSViewRepresentable {
    let session: AVCaptureSession

    func makeNSView(context: Context) -> CaptureVideoNSView {
        let view = CaptureVideoNSView()
        view.previewLayer.session = session
        return view
    }

    func updateNSView(_ nsView: CaptureVideoNSView, context: Context) {}
}

/// Сканирование QR с камеры Mac — декодирует произвольный QR в текст и
/// подставляет его в поле "Подключение по IP". См. QRScannerController
/// про то, почему это не официальный QR-флоу сопряжения Android.
struct QRScannerSheet: View {
    let onScanned: (String) -> Void
    let onClose: () -> Void

    @StateObject private var controller = QRScannerController()

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                SectionLabel(text: L("qrscan.title"), accent: CP.ice)
                Spacer()
                Button(L("common.close")) { onClose() }
                    .buttonStyle(NeonButtonStyle(accent: CP.textMuted))
            }

            if let error = controller.errorMessage {
                VStack(spacing: 12) {
                    Text(error)
                        .font(CP.mono(12))
                        .foregroundColor(CP.crimson)
                    if controller.isPermissionDenied {
                        Button(L("qrscan.openSettings")) { controller.openSystemSettings() }
                            .buttonStyle(NeonButtonStyle(accent: CP.ice, filled: true))
                    }
                }
                .frame(width: 360, height: 200)
            } else {
                CameraPreview(session: controller.session)
                    .frame(width: 360, height: 360)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(CP.hairline, lineWidth: 1))
            }

            Text(L("qrscan.hint"))
                .font(CP.mono(11))
                .foregroundColor(CP.textMuted)
        }
        .padding(20)
        .frame(width: 400)
        .background(CP.bg)
        .onAppear { controller.start() }
        .onDisappear { controller.stop() }
        .onChange(of: controller.scannedText) { text in
            guard let text else { return }
            onScanned(text)
            onClose()
        }
    }
}
