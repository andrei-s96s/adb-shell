// Чистые функции форматирования вывода демо-устройства -- строят тот же
// сырой текст, что настоящий adb/устройство отдали бы на реальные команды
// (`adb devices -l`, `pm list packages`, `dumpsys package X`, `ls -la` и
// т.д.), специально в ФОРМАТЕ, который понимают уже существующие парсеры
// (src/main/adb/parsers/*.ts) -- DemoAdbService просто скармливает этот
// текст тем же парсерам, которыми пользуется настоящий AdbService, вместо
// того чтобы дублировать их разбор. Без побочных эффектов -- поэтому
// протестировано напрямую через реальные парсеры в demoFormatters.test.ts.

import { DemoAppProfile, DemoRemoteEntry, DEMO_SERIAL, DEMO_MODEL, DEMO_PRODUCT } from './demoData';

/** Короткая детерминированная "хеш-строка" от имени пакета -- только чтобы
 * codePath/apkPath выглядели как реальные (Android кладёт APK в директории
 * со случайным суффиксом вида ~~AbCdEf==), не для какой-либо криптостойкости. */
function pseudoHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function apkDirFor(packageName: string): string {
  const hash = pseudoHash(packageName);
  return `/data/app/~~${hash}==/${packageName}-${hash.slice(0, 4)}==`;
}

// MARK: adb devices -l

export function formatDevicesList(): string {
  return [
    'List of devices attached',
    `${DEMO_SERIAL}          device product:${DEMO_PRODUCT} model:${DEMO_MODEL} device:${DEMO_PRODUCT} transport_id:1`,
    '',
  ].join('\n');
}

// MARK: adb shell getprop [key]

export function formatGetpropAll(props: Record<string, string>): string {
  return Object.entries(props)
    .map(([key, value]) => `[${key}]: [${value}]`)
    .join('\n');
}

// MARK: adb shell pm list packages [-3|-d]

export function formatPmListPackages(apps: DemoAppProfile[]): string {
  return apps.map((a) => `package:${a.packageName}`).join('\n');
}

// MARK: adb shell dumpsys package <pkg>

export function formatDumpsysPackageDetail(app: DemoAppProfile, enabled: boolean, runtimeOverride?: Record<string, boolean>): string {
  const dir = apkDirFor(app.packageName);
  const lines: string[] = [
    `  Package [${app.packageName}] (${pseudoHash(app.packageName)}):`,
    `    userId=${app.uid}`,
    `    versionName=${app.versionName}`,
    `    versionCode=${app.versionCode}`,
    `    minSdk=24`,
    `    targetSdk=${app.targetSdk}`,
    `    firstInstallTime=${app.firstInstallTime}`,
    `    lastUpdateTime=${app.lastUpdateTime}`,
    `    installerPackageName=com.android.vending`,
    `    codePath=${dir}`,
    `    resourcePath=${dir}`,
    `    enabled=${enabled}`,
  ];
  if (app.requestedPermissions.length > 0) {
    lines.push('    requested permissions:');
    for (const p of app.requestedPermissions) lines.push(`      ${p}`);
  }
  const installEntries = Object.entries(app.installPermissions);
  if (installEntries.length > 0) {
    lines.push('    install permissions:');
    for (const [name, granted] of installEntries) lines.push(`      ${name}: granted=${granted}`);
  }
  const runtimeEntries = Object.entries(runtimeOverride ?? app.runtimePermissions);
  if (runtimeEntries.length > 0) {
    lines.push('    User 0: installed=true hidden=false');
    lines.push('      runtime permissions:');
    for (const [name, granted] of runtimeEntries) {
      lines.push(`        ${name}: granted=${granted}, flags=[ USER_SENSITIVE_WHEN_GRANTED|USER_SENSITIVE_WHEN_DENIED]`);
    }
  }
  return lines.join('\n');
}

// MARK: adb shell dumpsys package (весь вывод, для installedVersionCodes)

export function formatDumpsysPackageBulk(apps: DemoAppProfile[]): string {
  return apps.map((a) => `Package [${a.packageName}] (${pseudoHash(a.packageName)}):\n    versionCode=${a.versionCode}`).join('\n');
}

// MARK: adb shell pm path <pkg>

export function formatPmPath(app: DemoAppProfile): string {
  return `package:${apkDirFor(app.packageName)}/base.apk`;
}

// MARK: adb shell ls -la <path>

export function formatLsLa(entries: DemoRemoteEntry[]): string {
  const lines = [`total ${entries.length * 8}`];
  for (const e of entries) {
    const perms = e.isDirectory ? 'drwxrwx--x' : '-rw-rw----';
    const links = e.isDirectory ? '4' : '1';
    lines.push(`${perms}   ${links} root     sdcard_rw ${String(e.sizeBytes).padStart(10, ' ')} ${e.modified.replace(' ', ' ')} ${e.name}`);
  }
  return lines.join('\n');
}

// MARK: adb shell ps -A -o PID,PPID,USER,RSS,NAME

export interface DemoProcess {
  pid: number;
  ppid: number;
  user: string;
  rssKB: number;
  name: string;
}

export function formatPs(processes: DemoProcess[]): string {
  const lines = ['PID PPID USER RSS NAME'];
  for (const p of processes) {
    lines.push(`${p.pid} ${p.ppid} ${p.user} ${p.rssKB} ${p.name}`);
  }
  return lines.join('\n');
}

// MARK: Мониторинг -- dumpsys cpuinfo / cat /proc/meminfo / dumpsys battery

export function formatCpuInfo(percent: number): string {
  const user = percent * 0.6;
  const kernel = percent * 0.3;
  const io = percent - user - kernel;
  return [
    `Load: 1.2 / 1.5 / 1.4`,
    `  ${percent.toFixed(0)}% TOTAL: ${user.toFixed(1)}% user + ${kernel.toFixed(1)}% kernel + ${io.toFixed(1)}% iowait`,
  ].join('\n');
}

export function formatMemInfo(totalKB: number, availableKB: number): string {
  return [`MemTotal:        ${totalKB} kB`, `MemAvailable:    ${availableKB} kB`, `MemFree:         ${Math.round(availableKB * 0.7)} kB`].join(
    '\n'
  );
}

export function formatBattery(level: number, temperatureTenths: number, charging: boolean): string {
  return [
    'Current Battery Service state:',
    `  AC powered: ${charging}`,
    '  USB powered: false',
    '  Wireless powered: false',
    `  status: ${charging ? 2 : 3}`,
    '  health: 2',
    `  level: ${level}`,
    '  scale: 100',
    `  temperature: ${temperatureTenths}`,
    '  voltage: 4123',
  ].join('\n');
}

// MARK: Безопасность -- отдельные getprop/which/settings

export function formatPlainValue(value: string): string {
  return value;
}

// MARK: adb shell ip route (после tcpip)

export function formatIpRoute(ip: string): string {
  return [
    `192.168.1.0/24 dev wlan0  proto kernel  scope link  src ${ip}`,
    `default via 192.168.1.1 dev wlan0  proto ra  metric 600`,
  ].join('\n');
}

// MARK: adb forward --list / adb reverse --list

export interface DemoForwardEntry {
  hostSpec: string;
  deviceSpec: string;
}

export function formatForwardList(serial: string, entries: DemoForwardEntry[]): string {
  return entries.map((e) => `${serial} ${e.hostSpec} ${e.deviceSpec}`).join('\n');
}

/** adb reverse --list печатает "<serial> <remote> <local>" -- remote
 * (на устройстве, т.е. deviceSpec) первым, local (hostSpec) вторым --
 * порядок колонок обратный формату forward (см. PortForwardParser.ts). */
export function formatReverseList(serial: string, entries: DemoForwardEntry[]): string {
  return entries.map((e) => `${serial} ${e.deviceSpec} ${e.hostSpec}`).join('\n');
}

// MARK: dumpsys netstats detail

export interface DemoNetUsage {
  uid: number;
  rxBytes: number;
  txBytes: number;
}

export function formatNetstatsDetail(usages: DemoNetUsage[]): string {
  return usages.map((u) => `  uid=${u.uid} tag=0x0 set=0 rxBytes=${u.rxBytes} rxPackets=1200 txBytes=${u.txBytes} txPackets=900`).join('\n');
}

// MARK: dumpsys usagestats

export interface DemoUsage {
  packageName: string;
  totalTimeSeconds: number;
}

export function formatUsageStats(usages: DemoUsage[]): string {
  return usages.map((u) => `  package: ${u.packageName}\n    totalTimeUsed=${u.totalTimeSeconds * 1000}`).join('\n');
}

// MARK: /data/anr, /data/tombstones

export function formatCrashListing(names: string[]): string {
  return names.join('\n');
}
