// Порт Sources/AdbShell/Services/UsageStatsParser.swift — разбор `dumpsys
// usagestats`. Недокументированный и версионно-нестабильный формат (как и
// netstats detail). Отслеживает "текущий пакет" по строкам вида
// `package: com.x` / `package=com.x` и подхватывает ближайшее к нему
// значение длительности (totalTimeUsed=/totalTimeVisible=/totalTime=),
// которое встречается либо числом в миллисекундах, либо строкой вида
// "1h23m45s566ms". Best-effort: на устройстве/версии Android, где формат
// отличается, просто вернёт пустой список, а не сломает вызывающую сторону.

import { AppUsageStat } from '../types/AppUsageStat';

const PACKAGE_RE = /package[=:]\s*([\w.]+)/;
const DURATION_KEY_RE = /totalTime(?:Used|Visible)?=(\+?[\w]+)/;
const DURATION_COMPONENT_RE = /(\d+)h|(\d+)m(?!s)|(\d+)s/g;

export function parseUsageStats(output: string): AppUsageStat[] {
  let currentPackage: string | undefined;
  const totals = new Map<string, number>();
  const order: string[] = [];

  for (const line of output.split('\n')) {
    const pkgMatch = line.match(PACKAGE_RE);
    if (pkgMatch) {
      currentPackage = pkgMatch[1];
      if (!order.includes(currentPackage)) order.push(currentPackage);
    }
    if (!currentPackage) continue;
    const durationMatch = line.match(DURATION_KEY_RE);
    if (!durationMatch) continue;
    const seconds = parseDurationToSeconds(durationMatch[1]);
    if (seconds === undefined) continue;
    totals.set(currentPackage, seconds);
  }

  return order
    .map((pkg): AppUsageStat | undefined => {
      const seconds = totals.get(pkg);
      if (seconds === undefined || seconds <= 0) return undefined;
      return { packageName: pkg, totalSeconds: seconds };
    })
    .filter((stat): stat is AppUsageStat => stat !== undefined);
}

export function parseDurationToSeconds(raw: string): number | undefined {
  const value = raw.startsWith('+') ? raw.slice(1) : raw;

  if (/^\d+$/.test(value)) {
    return Math.floor(Number(value) / 1000);
  }

  const matches = [...value.matchAll(DURATION_COMPONENT_RE)];
  if (matches.length === 0) return undefined;

  let total = 0;
  for (const match of matches) {
    if (match[1] !== undefined) total += Number(match[1]) * 3600;
    if (match[2] !== undefined) total += Number(match[2]) * 60;
    if (match[3] !== undefined) total += Number(match[3]);
  }
  return total;
}
