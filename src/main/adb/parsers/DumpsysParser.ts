// Порт parseAppDetail из Sources/AdbShell/Services/DumpsysParser.swift
// (parseVersionCodes -- см. VersionCodeParser.ts рядом, для bulk-сверки
// установленных приложений с F-Droid). Формат `dumpsys package <pkg>`
// неофициальный и слегка отличается между версиями Android, парсер
// намеренно толерантен к отсутствующим секциям.

import { AppDetail, AppPermission } from '../types/AppInfo';

type Section = 'none' | 'requested' | 'runtime' | 'install';

function value(line: string, key: string): string | undefined {
  const idx = line.indexOf(key);
  if (idx === -1) return undefined;
  return line.slice(idx + key.length).trim();
}

export function parseAppDetail(packageName: string, output: string): AppDetail {
  const lines = output.split('\n');

  let versionName: string | undefined;
  let versionCode: string | undefined;
  let firstInstallTime: string | undefined;
  let lastUpdateTime: string | undefined;
  let targetSdk: string | undefined;
  let apkPath: string | undefined;
  let enabled = true;
  let uid: number | undefined;

  const requested: string[] = [];
  const runtimeGrantedMap = new Map<string, boolean>();
  const installGrantedMap = new Map<string, boolean>();

  let section: Section = 'none';

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const indent = rawLine.length - rawLine.replace(/^ +/, '').length;

    const v1 = value(trimmed, 'versionName=');
    if (v1 !== undefined) versionName = v1;

    const v2 = value(trimmed, 'versionCode=');
    if (v2 !== undefined) versionCode = v2.split(' ')[0] ?? v2;

    const v3 = value(trimmed, 'firstInstallTime=');
    if (v3 !== undefined) firstInstallTime = v3;

    const v4 = value(trimmed, 'lastUpdateTime=');
    if (v4 !== undefined) lastUpdateTime = v4;

    const v5 = value(trimmed, 'targetSdk=');
    if (v5 !== undefined) targetSdk = v5;

    if (uid === undefined) {
      const v6 = value(trimmed, 'userId=');
      if (v6 !== undefined) uid = Number.parseInt(v6, 10);
    }
    if (uid === undefined) {
      const v7 = value(trimmed, 'appId=');
      if (v7 !== undefined) uid = Number.parseInt(v7, 10);
    }

    if (trimmed.startsWith('codePath=')) {
      apkPath = value(trimmed, 'codePath=');
    }

    if (trimmed.startsWith('enabled=')) {
      const v = value(trimmed, 'enabled=') ?? 'true';
      const upper = v.toUpperCase();
      enabled = !(
        v === 'false' ||
        v === '0' ||
        upper === 'COMPONENT_ENABLED_STATE_DISABLED' ||
        upper === 'COMPONENT_ENABLED_STATE_DISABLED_USER'
      );
    }

    // Определяем секцию по заголовку (без учёта отступа, как есть в dumpsys).
    if (trimmed.startsWith('requested permissions:')) {
      section = 'requested';
      continue;
    } else if (trimmed.startsWith('runtime permissions:')) {
      section = 'runtime';
      continue;
    } else if (trimmed.startsWith('install permissions:')) {
      section = 'install';
      continue;
    } else if (trimmed.endsWith(':') && indent <= 4 && trimmed.length > 0) {
      // Любой другой заголовок секции верхнего уровня — выходим из текущей.
      section = 'none';
      continue;
    }

    if (trimmed.length === 0) continue;

    if (section === 'requested') {
      if (trimmed.startsWith('android.permission') || trimmed.includes('.permission.')) {
        requested.push(trimmed);
      } else {
        section = 'none';
      }
    } else if (section === 'runtime' || section === 'install') {
      // Формат: "android.permission.CAMERA: granted=true, flags=[...]"
      const colonIdx = trimmed.indexOf(': ');
      if (colonIdx === -1) continue;
      const name = trimmed.slice(0, colonIdx);
      const rest = trimmed.slice(colonIdx + 2);
      if (name.includes('.permission.') || name.startsWith('android.permission')) {
        const granted = rest.includes('granted=true');
        if (section === 'runtime') {
          runtimeGrantedMap.set(name, granted);
        } else {
          installGrantedMap.set(name, granted);
        }
      }
    }
  }

  const permissionNames = new Set<string>(requested);
  for (const name of runtimeGrantedMap.keys()) permissionNames.add(name);
  for (const name of installGrantedMap.keys()) permissionNames.add(name);

  const permissions: AppPermission[] = Array.from(permissionNames)
    .map((name) => {
      // Разрешение реально переключаемо через pm grant/revoke только если
      // Android перечислил его в секции "runtime permissions:". Всё, что
      // встретилось лишь в "install permissions:" или только в "requested
      // permissions:" — install-time (normal/signature), выдаётся
      // автоматически, pm revoke на нём просто падает с ошибкой.
      if (runtimeGrantedMap.has(name)) {
        return { name, granted: runtimeGrantedMap.get(name)!, isRuntime: true };
      }
      const granted = installGrantedMap.get(name) ?? true;
      return { name, granted, isRuntime: false };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    packageName,
    versionName,
    versionCode,
    firstInstallTime,
    lastUpdateTime,
    targetSdk,
    apkPath,
    isEnabled: enabled,
    permissions,
    uid,
  };
}
