import { AppPermission } from '../adb/types/AppInfo';

/** Порт `detail.permissions.filter { $0.isRuntime && $0.granted }.map(\.name)`
 * из AppsViewModel.exportBundle в Sources/AdbShell/ViewModels/AppsViewModel.swift
 * -- только выданные runtime-разрешения идут в манифест набора (install-time
 * разрешения выдаются автоматически при установке, их незачем и нельзя
 * восстанавливать через pm grant). */
export function grantedRuntimePermissionNames(permissions: AppPermission[]): string[] {
  return permissions.filter((p) => p.isRuntime && p.granted).map((p) => p.name);
}
