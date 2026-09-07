// Чистая логика для библиотеки APK, не завязанная на файловую систему/aapt2
// -- сама инспекция (aapt2 dump badging) идёт в ApkLibraryService, сюда
// передаётся уже готовый список (packageName, versionCode) на файл.

export interface InspectedApkFile {
  path: string;
  name: string;
  packageName: string;
  versionCode: number;
}

export interface OutdatedDuplicate {
  packageName: string;
  latestVersionCode: number;
  latestFileName: string;
}

/** Из уже проинспектированных файлов библиотеки находит те, для которых в
 * ТОЙ ЖЕ библиотеке есть файл с БОЛЬШИМ versionCode того же packageName --
 * то есть устаревшую копию, которую можно удалить, оставив только более
 * новую версию. Файлы с уникальным packageName в библиотеке, и файлы,
 * которые сами являются максимальной версией своего пакета (в т.ч. когда
 * несколько файлов делят один и тот же максимальный versionCode -- тогда
 * ни один из них не считается "устаревшим", это не диагностируемая отсюда
 * проблема "точных дублей", а другой класс задачи), в результат не
 * попадают. Ключ результата — path устаревшего файла. */
export function findOutdatedDuplicates(files: InspectedApkFile[]): Record<string, OutdatedDuplicate> {
  const maxByPackage = new Map<string, InspectedApkFile>();
  for (const file of files) {
    const current = maxByPackage.get(file.packageName);
    if (!current || file.versionCode > current.versionCode) maxByPackage.set(file.packageName, file);
  }

  const result: Record<string, OutdatedDuplicate> = {};
  for (const file of files) {
    const latest = maxByPackage.get(file.packageName);
    if (!latest || latest.path === file.path) continue;
    if (file.versionCode >= latest.versionCode) continue;
    result[file.path] = { packageName: file.packageName, latestVersionCode: latest.versionCode, latestFileName: latest.name };
  }
  return result;
}
