import AppKit
import CoreImage

/// Генерация QR-кода из строки через встроенный CoreImage-фильтр
/// (`CIQRCodeGenerator`) — без сторонних зависимостей. Используется для
/// адреса доната в Настройках, чтобы его можно было отсканировать вместо
/// ручного набора.
enum QRCode {
    static func image(from string: String, scale: CGFloat = 8) -> NSImage? {
        let data = Data(string.utf8)
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage else { return nil }

        let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let rep = NSCIImageRep(ciImage: scaled)
        let image = NSImage(size: rep.size)
        image.addRepresentation(rep)
        return image
    }
}
