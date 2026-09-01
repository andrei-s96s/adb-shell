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
import { parseRemoteFiles } from './parsers/RemoteFileParser';

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
    const result = await this.run(['connect', host]);
    return combinedOutput(result).trim();
  }

  async disconnect(serial: string): Promise<void> {
    await this.run(['disconnect', serial]);
  }

  async pair(hostPort: string, code: string): Promise<string> {
    const result = await this.run(['pair', hostPort, code], { timeoutMs: 15000 });
    return combinedOutput(result).trim();
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
}
