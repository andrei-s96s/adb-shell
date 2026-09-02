// Порт Sources/AdbShell/Services/FDroidUpdateChecker.swift — сверяет
// установленный пакет с официальным каталогом F-Droid
// (https://f-droid.org/api/v1/packages/<pkg>, документированный публичный
// эндпоинт того же сайта, не скрейпинг) — только для приложений, у которых
// F-Droid вообще есть сборка; для остальных эндпоинт просто отвечает 404,
// это не ошибка. Ничего не ставит и не скачивает сам — только сообщает,
// что есть более новая versionCode, дальше решает пользователь.

import { FDroidUpdateInfo } from '../adb/types/FDroidUpdateInfo';

interface PackagesResponse {
  packageName: string;
  suggestedVersionCode?: number;
  packages?: Array<{ versionName?: string; versionCode?: number }>;
}

/** undefined = пакета нет в каталоге F-Droid, сеть недоступна, или
 * установленная версия уже не старше самой свежей в каталоге. */
export async function checkFDroidUpdate(packageName: string, installedVersionCode: number): Promise<FDroidUpdateInfo | undefined> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const response = await fetch(`https://f-droid.org/api/v1/packages/${packageName}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return undefined;
    const data = await response.text();
    return parseFDroidResponse(data, installedVersionCode);
  } catch {
    return undefined;
  }
}

/** Вынесено в чистую функцию, разбирающую уже полученный текст ответа —
 * сеть замокать неудобно, а разбор реального JSON стоит покрыть тестами. */
export function parseFDroidResponse(json: string, installedVersionCode: number): FDroidUpdateInfo | undefined {
  let decoded: PackagesResponse;
  try {
    decoded = JSON.parse(json) as PackagesResponse;
  } catch {
    return undefined;
  }
  if (typeof decoded.packageName !== 'string') return undefined;

  const allCodes = (decoded.packages ?? []).map((p) => p.versionCode).filter((c): c is number => typeof c === 'number');
  const candidates = [...allCodes];
  if (typeof decoded.suggestedVersionCode === 'number') candidates.push(decoded.suggestedVersionCode);
  const maxCode = candidates.length > 0 ? Math.max(...candidates) : undefined;
  if (maxCode === undefined || maxCode <= installedVersionCode) return undefined;

  const name = decoded.packages?.find((p) => p.versionCode === maxCode)?.versionName;
  return {
    packageName: decoded.packageName,
    installedVersionCode,
    latestVersionCode: maxCode,
    latestVersionName: name,
  };
}
