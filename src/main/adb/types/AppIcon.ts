// Порт-независимый общий тип для AppIconService (иконки установленных на
// устройстве приложений) и ApkLibraryService (иконки локальных .apk) --
// оба реализуют один и тот же путь (aapt2 dump badging -> resolveAdaptiveIconFile
// при необходимости -> AdmZip.readFile), поэтому и результат один и тот же.

export interface AppIcon {
  data: Buffer;
  mimeType: 'image/png' | 'image/webp';
}
