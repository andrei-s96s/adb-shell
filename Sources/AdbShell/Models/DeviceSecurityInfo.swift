import Foundation

/// Сводка по целостности устройства, собранная из системных свойств и `settings`
/// без root. Настоящую проверку SafetyNet/Play Integrity выполнить с устройства
/// через adb нельзя — это удалённая attestation к серверам Google, здесь
/// показываются локальные признаки root/разлочки, которые на неё влияют.
struct DeviceSecurityInfo: Equatable {
    /// "green" (заводская, полностью проверена), "orange" (разлочен bootloader),
    /// "yellow" (кастомный ключ), "red" (проверка не пройдена) — либо nil,
    /// если ro.boot.verifiedbootstate недоступен (эмуляторы, часть кастомных прошивок).
    let verifiedBootState: String?
    /// nil, если ro.boot.flash.locked недоступен.
    let bootloaderLocked: Bool?
    let isDebuggable: Bool
    let isSecure: Bool
    /// `which su` нашёл бинарник — эвристика, не 100% надёжная (встречается
    /// отключённый su на некоторых прошивках даже без root-доступа).
    let suBinaryPresent: Bool
    /// "1" — пользователь разрешил Play Protect проверять приложения, "-1" — отключил,
    /// nil — настройка недоступна на этом устройстве/прошивке.
    let playProtectConsent: String?
}
