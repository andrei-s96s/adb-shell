import { AppPermission } from '../adb/types/AppInfo';
import { AppBundleManifest } from '../adb/types/AppBundleManifest';

/** Порт `detail.permissions.filter { $0.isRuntime && $0.granted }.map(\.name)`
 * из AppsViewModel.exportBundle в Sources/AdbShell/ViewModels/AppsViewModel.swift
 * -- только выданные runtime-разрешения идут в манифест набора (install-time
 * разрешения выдаются автоматически при установке, их незачем и нельзя
 * восстанавливать через pm grant). */
export function grantedRuntimePermissionNames(permissions: AppPermission[]): string[] {
  return permissions.filter((p) => p.isRuntime && p.granted).map((p) => p.name);
}

export interface ManifestPackageDiff {
  packageName: string;
  inA: boolean;
  inB: boolean;
  versionA?: string;
  versionB?: string;
  /** В b, но не в a -- пусто, если пакета нет в a вовсе (тогда "разница" —
   * это appeared, а не набор конкретных новых разрешений). */
  addedPermissions: string[];
  removedPermissions: string[];
}

/** Сравнивает два манифеста (снапшота или набора приложений) по пакетам:
 * какие появились/пропали, и для общих — изменилась ли версия или набор
 * ВЫДАННЫХ runtime-разрешений. Не различает "пакета нет в a" от "пакет
 * есть, но без разрешений" при подсчёте added/removed -- addedPermissions
 * для нового пакета это все его разрешения (сравнение с пустым множеством),
 * что и ожидается от diff. Отсортировано по packageName для стабильного
 * порядка вывода независимо от порядка entries в исходных манифестах. */
export function diffManifests(a: AppBundleManifest, b: AppBundleManifest): ManifestPackageDiff[] {
  const byPkgA = new Map(a.entries.map((e) => [e.packageName, e]));
  const byPkgB = new Map(b.entries.map((e) => [e.packageName, e]));
  const allPackages = new Set([...byPkgA.keys(), ...byPkgB.keys()]);

  const result: ManifestPackageDiff[] = [];
  for (const pkg of allPackages) {
    const entryA = byPkgA.get(pkg);
    const entryB = byPkgB.get(pkg);
    const permsA = new Set(entryA?.permissions ?? []);
    const permsB = new Set(entryB?.permissions ?? []);
    result.push({
      packageName: pkg,
      inA: entryA !== undefined,
      inB: entryB !== undefined,
      versionA: entryA?.versionName,
      versionB: entryB?.versionName,
      addedPermissions: [...permsB].filter((p) => !permsA.has(p)).sort(),
      removedPermissions: [...permsA].filter((p) => !permsB.has(p)).sort(),
    });
  }
  return result.sort((x, y) => x.packageName.localeCompare(y.packageName));
}

/** true, если diff-запись отражает реальное отличие -- пакет появился/
 * пропал/сменил версию/сменил набор разрешений. Отсекает "unchanged" для
 * UI, которому нет смысла показывать сотни одинаковых строк. */
export function isMeaningfulDiff(entry: ManifestPackageDiff): boolean {
  return (
    !entry.inA || !entry.inB || entry.versionA !== entry.versionB || entry.addedPermissions.length > 0 || entry.removedPermissions.length > 0
  );
}
