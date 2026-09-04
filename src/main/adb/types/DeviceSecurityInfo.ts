// Порт Sources/AdbShell/Models/DeviceSecurityInfo.swift

/** "green" (заводская, полностью проверена), "orange" (разлочен bootloader),
 * "yellow" (кастомный ключ), "red" (проверка не пройдена) — либо undefined,
 * если ro.boot.verifiedbootstate недоступен (эмуляторы, часть кастомных прошивок). */
export interface DeviceSecurityInfo {
  verifiedBootState?: string;
  /** undefined, если ro.boot.flash.locked недоступен. */
  bootloaderLocked?: boolean;
  isDebuggable: boolean;
  isSecure: boolean;
  /** `which su` нашёл бинарник — эвристика, не 100% надёжная. */
  suBinaryPresent: boolean;
  /** "1" — пользователь разрешил Play Protect проверять приложения, "-1" —
   * отключил, undefined — настройка недоступна на этом устройстве/прошивке. */
  playProtectConsent?: string;
}

export type SecurityLevel = 'ok' | 'warning' | 'critical';

export interface SecurityFinding {
  level: SecurityLevel;
  /** Ключ локализации/текста — сам текст резолвится в UI. */
  messageKey: string;
}
