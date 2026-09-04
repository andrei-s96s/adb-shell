// Порт Sources/AdbShell/Services/ApkBadgingParser.swift — разбор вывода
// `aapt2 dump badging <apk>` (тот же способ, что использует официальный
// Android Gradle Plugin для чтения манифеста локального .apk без установки
// на устройство).

import { ApkManifestInfo } from '../types/ApkManifestInfo';

export function parseApkBadging(output: string): ApkManifestInfo {
  let packageName: string | undefined;
  let versionName: string | undefined;
  let versionCode: string | undefined;
  let minSdk: string | undefined;
  let targetSdk: string | undefined;
  let applicationLabel: string | undefined;
  const permissions: string[] = [];

  for (const line of output.split('\n')) {
    if (line.startsWith('package:')) {
      packageName = attribute(line, 'name');
      versionCode = attribute(line, 'versionCode');
      versionName = attribute(line, 'versionName');
    } else if (line.startsWith('sdkVersion:')) {
      minSdk = quotedValue(line);
    } else if (line.startsWith('targetSdkVersion:')) {
      targetSdk = quotedValue(line);
    } else if (line.startsWith('application-label:')) {
      applicationLabel = quotedValue(line);
    } else if (line.startsWith('uses-permission:')) {
      const name = attribute(line, 'name');
      if (name !== undefined) permissions.push(name);
    }
  }

  return { packageName, versionName, versionCode, minSdk, targetSdk, applicationLabel, permissions, rawBadging: output };
}

/** Значение вида name='значение' в произвольном месте строки. */
function attribute(line: string, name: string): string | undefined {
  const marker = `${name}='`;
  const start = line.indexOf(marker);
  if (start === -1) return undefined;
  const rest = line.slice(start + marker.length);
  const end = rest.indexOf("'");
  if (end === -1) return undefined;
  return rest.slice(0, end);
}

/** Значение вида label:'значение' сразу после первого двоеточия строки. */
function quotedValue(line: string): string | undefined {
  const colon = line.indexOf(':');
  if (colon === -1) return undefined;
  const rest = line.slice(colon + 1);
  const firstQuote = rest.indexOf("'");
  if (firstQuote === -1) return undefined;
  const afterQuote = rest.slice(firstQuote + 1);
  const end = afterQuote.indexOf("'");
  if (end === -1) return undefined;
  return afterQuote.slice(0, end);
}
