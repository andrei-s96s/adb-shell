import { ApkCertificateInfo } from '../../apkLibrary/apkSignatureLogic';

/** Результат ApkLibraryService.getSignatureInfo -- sha256 всегда посчитан
 * (единственный сигнал, который никогда не подведёт: точный слепок файла
 * байт-в-байт), certificate -- best-effort извлечение из подписи JAR/v1
 * (META-INF/*.RSA|*.DSA|*.EC), которое может не найтись (APK подписан
 * только v2/v3-схемой без v1-совместимости, файл повреждён, и т.п.) -- это
 * не ошибка, просто в UI нужно честно показать "не удалось извлечь", а не
 * притвориться, что сертификата нет вовсе. */
export interface ApkSignatureInfo {
  sha256: string;
  certificate?: ApkCertificateInfo;
}
