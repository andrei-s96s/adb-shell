// Извлечение подписи из локального .apk. Содержимое `META-INF/*.RSA|*.DSA|*.EC`
// внутри APK -- это PKCS#7 SignedData-контейнер, а не голый X.509-сертификат,
// и писать полноценный ASN.1-парсер PKCS#7 ради одного поля рискованно: легко
// ошибиться на реальных APK, которых нет под рукой в достаточном разнообразии
// для тестирования. Вместо этого сканируем содержимое побайтово в поисках
// сигнатуры DER SEQUENCE с 2-байтовой длиной (0x30 0x82 <hi> <lo> --
// сертификаты такого размера ей исчерпывающе покрываются) и пробуем
// распарсить найденный диапазон как X509Certificate; сам класс node:crypto
// служит валидатором совпадения -- на мусорном срабатывании (внутри PKCS#7
// таких байтовых последовательностей может быть несколько: OID'ы, встроенные
// цепочки/CRL и т.п.) конструктор бросает исключение, и сканирование просто
// идёт дальше по буферу. Результат -- best-effort: если сертификат найти не
// удалось, sha256 всего файла (см. ApkLibraryService.getSignatureInfo)
// остаётся единственным, но всегда надёжным сигналом идентичности файла.

import { X509Certificate } from 'node:crypto';

export interface ApkCertificateInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  fingerprint256: string;
  serialNumber: string;
  /** Самоподписанный сертификат (subject === issuer) -- обычное дело для
   * Android: `apksigner`/`jarsigner` не требуют CA-подписанной цепочки,
   * почти все debug- и большинство release-ключей самоподписанные. Это не
   * тревожный признак сам по себе, а просто уточнение к отображению. */
  selfSigned: boolean;
}

/** DER-заголовок SEQUENCE с 2-байтовой длиной -- минимум 4 байта до начала
 * содержимого (тег + форма длины + 2 байта самой длины). */
const DER_SEQUENCE_2BYTE_LEN_TAG = 0x30;
const DER_LONG_FORM_2BYTE = 0x82;

/** Ищет и валидирует DER-кодированный X.509-сертификат внутри произвольного
 * буфера. Возвращает срез исходного буфера (не копию) на первом совпадении,
 * успешно прошедшем разбор X509Certificate, или undefined, если ни одно
 * совпадение не распарсилось. */
export function extractX509Der(buf: Buffer): Buffer | undefined {
  for (let i = 0; i + 4 <= buf.length; i++) {
    if (buf[i] !== DER_SEQUENCE_2BYTE_LEN_TAG || buf[i + 1] !== DER_LONG_FORM_2BYTE) continue;
    const contentLength = buf.readUInt16BE(i + 2);
    const end = i + 4 + contentLength;
    if (end > buf.length) continue;
    const candidate = buf.subarray(i, end);
    try {
      // eslint-disable-next-line no-new -- сам факт отсутствия исключения и есть проверка
      new X509Certificate(candidate);
    } catch {
      continue;
    }
    return candidate;
  }
  return undefined;
}

/** Достаёт отображаемые поля из уже провалидированного DER-сертификата
 * (обычно -- результата extractX509Der выше). Бросает исключение, если der
 * не является валидным X.509-сертификатом -- вызывающий код должен либо
 * гарантировать валидность заранее, либо сам ловить ошибку. */
export function describeCertificate(der: Buffer): ApkCertificateInfo {
  const cert = new X509Certificate(der);
  return {
    subject: cert.subject,
    issuer: cert.issuer,
    validFrom: cert.validFrom,
    validTo: cert.validTo,
    fingerprint256: cert.fingerprint256,
    serialNumber: cert.serialNumber,
    selfSigned: cert.subject === cert.issuer,
  };
}

/** Удобная обёртка над extractX509Der + describeCertificate для места
 * вызова (ApkLibraryService) -- пробует по очереди несколько буферов (по
 * одному на каждый META-INF/*.RSA|*.DSA|*.EC entry) и возвращает первый
 * успешно распознанный сертификат. */
export function findCertificateInEntries(entryBuffers: Buffer[]): ApkCertificateInfo | undefined {
  for (const buf of entryBuffers) {
    const der = extractX509Der(buf);
    if (!der) continue;
    try {
      return describeCertificate(der);
    } catch {
      continue;
    }
  }
  return undefined;
}
