// Порт Sources/AdbShell/Services/ADBService.swift — тонкая обёртка над CLI
// `adb`, вызывающая процесс и парсящая его вывод. Намеренно не импортирует
// 'electron' — должен оставаться тестируемым напрямую через `node --test`,
// без запуска в Electron-рантайме.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { Device } from './types/Device';
import { parseDevices } from './parsers/DeviceParser';
import { ProcessResult, combinedOutput } from './types/ProcessResult';
import { DeviceProperty, parseGetprop } from './parsers/GetpropParser';
import { PortForwardRule } from './types/PortForwardRule';
import { parseForwardList, parseReverseList } from './parsers/PortForwardParser';
import { parseDeviceIP } from './parsers/IpRouteParser';
import { AppDetail, InstalledApp } from './types/AppInfo';
import { mergeApps } from './parsers/AppListParser';
import { parseAppDetail } from './parsers/DumpsysParser';
import { RemoteFile } from './types/RemoteFile';
import { DeviceStats } from './types/DeviceStats';
import { parseDeviceStats } from './parsers/DeviceStatsParser';
import { RunningProcess } from './types/RunningProcess';
import { parseProcessList } from './parsers/ProcessListParser';
import { parseRemoteFiles } from './parsers/RemoteFileParser';
import { MdnsDevice } from './types/MdnsDevice';
import { parseMdnsServices } from './parsers/MdnsParser';
import { normalizeConnectHost } from './parsers/ConnectHost';
import { DeviceSecurityInfo } from './types/DeviceSecurityInfo';
import { NetworkUsage, parseNetworkUsage } from './parsers/NetworkUsageParser';
import { AppUsageStat } from './types/AppUsageStat';
import { parseUsageStats } from './parsers/UsageStatsParser';
import { CrashTraceFile } from './types/CrashTraceFile';
import { parseCrashTraceListing } from './parsers/CrashTraceParser';

export class AdbCommandError extends Error {}

export class AdbService {
  readonly adbPath: string;

  constructor(adbPath?: string) {
    this.adbPath = adbPath ?? AdbService.locateAdb();
  }

  /** Аналог ADBService.locateADB() — вшитый в приложение бинарник (Фаза 6
   * упаковки положит его в resources), иначе полагаемся на PATH. */
  static locateAdb(): string {
    const exeName = process.platform === 'win32' ? 'adb.exe' : 'adb';
    const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
    if (resourcesPath) {
      const bundled = path.join(resourcesPath, exeName);
      if (fs.existsSync(bundled)) return bundled;
    }
    return exeName;
  }

  run(args: string[], options: { serial?: string; timeoutMs?: number } = {}): Promise<ProcessResult> {
    const allArgs = options.serial ? ['-s', options.serial, ...args] : args;
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(this.adbPath, allArgs, { windowsHide: true });
      } catch (error) {
        reject(new AdbCommandError(`Couldn't launch adb: ${(error as Error).message}`));
        return;
      }

      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = options.timeoutMs
        ? setTimeout(() => {
            if (!settled) child.kill();
          }, options.timeoutMs)
        : undefined;

      child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
      child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        reject(new AdbCommandError(`Couldn't launch adb: ${error.message}`));
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code });
      });
    });
  }

  // MARK: Устройства

  async listDevices(): Promise<Device[]> {
    const result = await this.run(['devices', '-l']);
    return parseDevices(result.stdout);
  }

  async connect(host: string): Promise<string> {
    const result = await this.run(['connect', normalizeConnectHost(host)]);
    return combinedOutput(result).trim();
  }

  async disconnect(serial: string): Promise<void> {
    await this.run(['disconnect', serial]);
  }

  async pair(hostPort: string, code: string): Promise<string> {
    const result = await this.run(['pair', hostPort, code], { timeoutMs: 15000 });
    return combinedOutput(result).trim();
  }

  /** Аналог ADBService.discoverMdnsDevices() — устройства с включённой
   * беспроводной отладкой (Android 11+), рекламирующие себя по mDNS. */
  async discoverMdnsDevices(): Promise<MdnsDevice[]> {
    const result = await this.run(['mdns', 'services']);
    return parseMdnsServices(result.stdout);
  }

  async shell(serial: string, command: string): Promise<string> {
    const result = await this.run(['shell', command], { serial });
    return combinedOutput(result);
  }

  // MARK: Wi-Fi отладка

  async enableWirelessDebugging(serial: string, port = 5555): Promise<string> {
    const result = await this.run(['tcpip', String(port)], { serial });
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
    return combinedOutput(result);
  }

  async deviceIPAddress(serial: string): Promise<string | undefined> {
    const result = await this.run(['shell', 'ip', 'route'], { serial });
    return parseDeviceIP(result.stdout);
  }

  // MARK: Проброс портов

  async listForwards(serial: string): Promise<PortForwardRule[]> {
    const result = await this.run(['forward', '--list'], { serial });
    return parseForwardList(result.stdout, serial);
  }

  async addForward(serial: string, hostSpec: string, deviceSpec: string): Promise<void> {
    const result = await this.run(['forward', hostSpec, deviceSpec], { serial });
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
  }

  async removeForward(serial: string, hostSpec: string): Promise<void> {
    const result = await this.run(['forward', '--remove', hostSpec], { serial });
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
  }

  async listReverses(serial: string): Promise<PortForwardRule[]> {
    const result = await this.run(['reverse', '--list'], { serial });
    return parseReverseList(result.stdout, serial);
  }

  async addReverse(serial: string, deviceSpec: string, hostSpec: string): Promise<void> {
    const result = await this.run(['reverse', deviceSpec, hostSpec], { serial });
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
  }

  async removeReverse(serial: string, deviceSpec: string): Promise<void> {
    const result = await this.run(['reverse', '--remove', deviceSpec], { serial });
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
  }

  // MARK: Свойства устройства

  async allProperties(serial: string): Promise<DeviceProperty[]> {
    const result = await this.run(['shell', 'getprop'], { serial });
    return parseGetprop(result.stdout);
  }

  // MARK: Приложения

  async listApps(serial: string): Promise<InstalledApp[]> {
    const [all, user, disabled] = await Promise.all([
      this.run(['shell', 'pm', 'list', 'packages'], { serial }),
      this.run(['shell', 'pm', 'list', 'packages', '-3'], { serial }),
      this.run(['shell', 'pm', 'list', 'packages', '-d'], { serial }),
    ]);
    return mergeApps(all.stdout, user.stdout, disabled.stdout);
  }

  async appDetail(serial: string, packageName: string): Promise<AppDetail> {
    const result = await this.run(['shell', 'dumpsys', 'package', packageName], { serial });
    return parseAppDetail(packageName, result.stdout);
  }

  async install(serial: string, apkPath: string): Promise<string> {
    const result = await this.run(['install', '-r', '-g', apkPath], { serial, timeoutMs: 120_000 });
    const combined = combinedOutput(result);
    if (result.exitCode !== 0 || combined.includes('Failure')) {
      throw new AdbCommandError(combined);
    }
    return combined;
  }

  async uninstall(serial: string, packageName: string): Promise<void> {
    const result = await this.run(['uninstall', packageName], { serial });
    const combined = combinedOutput(result);
    if (result.exitCode !== 0 || combined.includes('Failure')) {
      throw new AdbCommandError(combined);
    }
  }

  async forceStop(serial: string, packageName: string): Promise<void> {
    await this.run(['shell', 'am', 'force-stop', packageName], { serial });
  }

  async clearData(serial: string, packageName: string): Promise<void> {
    const result = await this.run(['shell', 'pm', 'clear', packageName], { serial });
    if (result.stdout.includes('Failed')) {
      throw new AdbCommandError(combinedOutput(result));
    }
  }

  async setEnabled(serial: string, packageName: string, enabled: boolean): Promise<void> {
    const subcommand = enabled ? 'enable' : 'disable-user';
    const args = ['shell', 'pm', subcommand];
    if (!enabled) args.push('--user', '0');
    args.push(packageName);
    const result = await this.run(args, { serial });
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
  }

  async grantPermission(serial: string, packageName: string, permission: string): Promise<void> {
    const result = await this.run(['shell', 'pm', 'grant', packageName, permission], { serial });
    if (result.exitCode !== 0 || result.stderr.length > 0) {
      throw new AdbCommandError(combinedOutput(result));
    }
  }

  async revokePermission(serial: string, packageName: string, permission: string): Promise<void> {
    const result = await this.run(['shell', 'pm', 'revoke', packageName, permission], { serial });
    if (result.exitCode !== 0 || result.stderr.length > 0) {
      throw new AdbCommandError(combinedOutput(result));
    }
  }

  // MARK: Файлы устройства

  async listDirectory(serial: string, dirPath: string): Promise<RemoteFile[]> {
    const result = await this.run(['shell', 'ls', '-la', dirPath], { serial });
    if (result.stdout.length === 0 && result.stderr.length > 0) {
      throw new AdbCommandError(result.stderr);
    }
    return parseRemoteFiles(result.stdout, dirPath);
  }

  async push(serial: string, localPath: string, remotePath: string): Promise<void> {
    const result = await this.run(['push', localPath, remotePath], { serial, timeoutMs: 300_000 });
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
  }

  async pull(serial: string, remotePath: string, localPath: string): Promise<void> {
    const result = await this.run(['pull', remotePath, localPath], { serial, timeoutMs: 300_000 });
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
  }

  async makeDirectory(serial: string, dirPath: string): Promise<void> {
    const result = await this.run(['shell', 'mkdir', '-p', dirPath], { serial });
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
  }

  async removeRemote(serial: string, targetPath: string, recursive: boolean): Promise<void> {
    const args = ['shell', 'rm', recursive ? '-rf' : '-f', targetPath];
    const result = await this.run(args, { serial });
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
  }

  // MARK: Мониторинг

  async deviceStats(serial: string): Promise<DeviceStats> {
    const [cpu, mem, battery] = await Promise.all([
      this.run(['shell', 'dumpsys', 'cpuinfo'], { serial }),
      this.run(['shell', 'cat', '/proc/meminfo'], { serial }),
      this.run(['shell', 'dumpsys', 'battery'], { serial }),
    ]);
    return parseDeviceStats(combinedOutput(cpu), combinedOutput(mem), combinedOutput(battery));
  }

  async runningProcesses(serial: string): Promise<RunningProcess[]> {
    const result = await this.run(['shell', 'ps', '-A', '-o', 'PID,PPID,USER,RSS,NAME'], { serial });
    return parseProcessList(result.stdout);
  }

  async killProcess(serial: string, pid: number): Promise<void> {
    await this.run(['shell', 'kill', String(pid)], { serial });
  }

  // MARK: Безопасность устройства

  /** Аналог ADBService.securityInfo(serial:) — локальные признаки
   * целостности устройства (root/разлочка/debuggable). Полноценный
   * SafetyNet/Play Integrity с устройства через adb не выполнить, это
   * удалённая проверка на серверах Google. */
  async securityInfo(serial: string): Promise<DeviceSecurityInfo> {
    const [verifiedBoot, flashLocked, debuggable, secure, suCheck, playProtect] = await Promise.all([
      this.run(['shell', 'getprop', 'ro.boot.verifiedbootstate'], { serial }),
      this.run(['shell', 'getprop', 'ro.boot.flash.locked'], { serial }),
      this.run(['shell', 'getprop', 'ro.debuggable'], { serial }),
      this.run(['shell', 'getprop', 'ro.secure'], { serial }),
      this.run(['shell', 'which', 'su'], { serial }),
      this.run(['shell', 'settings', 'get', 'global', 'package_verifier_user_consent'], { serial }),
    ]);
    const trim = (r: ProcessResult) => r.stdout.trim();

    const verifiedBootValue = trim(verifiedBoot);
    const flashLockedValue = trim(flashLocked);
    const debuggableValue = trim(debuggable);
    const secureValue = trim(secure);
    const suValue = trim(suCheck);
    const playProtectValue = trim(playProtect);

    return {
      verifiedBootState: verifiedBootValue.length === 0 ? undefined : verifiedBootValue,
      bootloaderLocked: flashLockedValue.length === 0 ? undefined : flashLockedValue === '1',
      isDebuggable: debuggableValue === '1',
      isSecure: secureValue !== '0',
      suBinaryPresent: suValue.length > 0 && !suValue.toLowerCase().includes('not found'),
      playProtectConsent:
        playProtectValue.length === 0 || playProtectValue.toLowerCase() === 'null' ? undefined : playProtectValue,
    };
  }

  // MARK: Сетевой трафик по приложению

  async networkUsage(serial: string, uid: number): Promise<NetworkUsage> {
    const result = await this.run(['shell', 'dumpsys', 'netstats', 'detail'], { serial });
    return parseNetworkUsage(combinedOutput(result), uid);
  }

  // MARK: Экранное время приложений

  async usageStats(serial: string): Promise<AppUsageStat[]> {
    const result = await this.run(['shell', 'dumpsys', 'usagestats'], { serial });
    return parseUsageStats(combinedOutput(result));
  }

  // MARK: ANR / tombstones

  /** Список файлов в /data/anr/ и /data/tombstones/. Без root оба каталога
   * обычно недоступны (Permission denied) — в этом случае просто пропускаем
   * соответствующую директорию, а не считаем это ошибкой всей операции. */
  async crashTraces(serial: string): Promise<CrashTraceFile[]> {
    const [anrResult, tombResult] = await Promise.all([
      this.run(['shell', 'ls', '-1', '/data/anr/'], { serial }).catch(() => undefined),
      this.run(['shell', 'ls', '-1', '/data/tombstones/'], { serial }).catch(() => undefined),
    ]);
    const files: CrashTraceFile[] = [];
    if (anrResult && anrResult.exitCode === 0) {
      files.push(...parseCrashTraceListing(anrResult.stdout, '/data/anr/', 'anr'));
    }
    if (tombResult && tombResult.exitCode === 0) {
      files.push(...parseCrashTraceListing(tombResult.stdout, '/data/tombstones/', 'tombstone'));
    }
    return files;
  }

  /** Хвост файла трейса — полные tombstone-файлы могут быть большими,
   * показываем последние ~30000 байт, обычно там самое важное (стек, сигнал). */
  async readCrashTrace(serial: string, filePath: string): Promise<string> {
    const result = await this.run(['shell', 'tail', '-c', '30000', filePath], { serial });
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
    return result.stdout;
  }
}
