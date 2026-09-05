// Демо-режим -- одно виртуальное устройство (DEMO_SERIAL), которое "живёт"
// без реального adb/устройства: можно посмотреть весь функционал
// приложения (Приложения, Файлы, Shell, Макросы, Мониторинг, Logcat,
// Инструменты) без подключённого Android.
//
// Архитектурно -- ЕДИНСТВЕННАЯ точка перехвата: AdbService.run() (плюс
// отдельно screenshot(), который спавнит процесс напрямую, минуя run()).
// Все ~40 публичных методов AdbService (listApps, appDetail, deviceStats,
// listDirectory и т.д.) сами внутри вызывают this.run([...]) и парсят его
// stdout уже существующими парсерами (src/main/adb/parsers/*.ts) -- поэтому
// достаточно унаследоваться и переопределить run(), чтобы получить
// listApps()/appDetail()/deviceStats()/... "бесплатно", без дублирования их
// логики: они распознают команду по args и возвращают текст в том же
// формате, что и настоящий adb, а дальше работает тот же самый парсер.
//
// main.ts переключает между реальным AdbService и этим классом через
// мутабельную переменную `adb` (demoMode:set) -- см. комментарий там.

import { AdbService } from '../AdbService';
import { ProcessResult } from '../types/ProcessResult';
import { DEMO_APPS, DEMO_GETPROP, DEMO_SERIAL, DEMO_IP, DemoAppProfile } from './demoData';
import {
  formatDevicesList,
  formatGetpropAll,
  formatPmListPackages,
  formatDumpsysPackageDetail,
  formatDumpsysPackageBulk,
  formatPmPath,
  formatLsLa,
  formatPs,
  formatCpuInfo,
  formatMemInfo,
  formatBattery,
  formatIpRoute,
  formatForwardList,
  formatReverseList,
  formatNetstatsDetail,
  formatUsageStats,
  formatCrashListing,
  DemoForwardEntry,
} from './demoFormatters';
import { demoScreenshotPng } from './demoScreenshot';
import { DemoFileSystem } from './DemoFileSystem';
import * as fs from 'node:fs';

interface AppState {
  profile: DemoAppProfile;
  installed: boolean;
  enabled: boolean;
  runtimeGranted: Record<string, boolean>;
}

/** Небольшая имитация задержки реального adb (30-180ms) -- мгновенный
 * отклик на КАЖДОЕ действие подсознательно читается как "ненастоящее"
 * сильнее, чем любая другая деталь демо-режима. */
function demoDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30 + Math.random() * 150));
}

function ok(stdout: string): ProcessResult {
  return { stdout, stderr: '', exitCode: 0 };
}

function fail(stderr: string): ProcessResult {
  return { stdout: '', stderr, exitCode: 1 };
}

const NOT_SIMULATED_NOTE = '(демо-режим: эта команда не эмулируется)';

export class DemoAdbService extends AdbService {
  private apps = new Map<string, AppState>(
    DEMO_APPS.map((profile) => [
      profile.packageName,
      { profile, installed: true, enabled: !profile.disabledByDefault, runtimeGranted: { ...profile.runtimePermissions } },
    ])
  );
  private forwards: DemoForwardEntry[] = [];
  private reverses: DemoForwardEntry[] = [];
  private fileSystem = new DemoFileSystem();
  /** Лёгкий дрейф для "живого" графика в Мониторинге -- не случайный шум
   * каждый раз (иначе график дёргается некрасиво), а плавная синусоида по
   * времени + небольшой шум. */
  private readonly statsPhase = Math.random() * Math.PI * 2;

  private installedApps(): DemoAppProfile[] {
    return [...this.apps.values()].filter((s) => s.installed).map((s) => s.profile);
  }

  override async run(args: string[], _options: { serial?: string; timeoutMs?: number } = {}): Promise<ProcessResult> {
    await demoDelay();

    if (args[0] === 'shell') {
      return this.runShell(args.slice(1).join(' '));
    }
    return this.runRawAdb(args);
  }

  override async screenshot(_serial: string): Promise<Buffer> {
    await demoDelay();
    return demoScreenshotPng();
  }

  // MARK: adb <args без "shell">

  private runRawAdb(args: string[]): ProcessResult {
    const [cmd, ...rest] = args;
    switch (cmd) {
      case 'devices':
        return ok(formatDevicesList());

      case 'connect':
        return ok(`already connected to ${DEMO_SERIAL} (демо-режим)`);
      case 'disconnect':
      case 'pair':
        return ok(`connected to ${DEMO_SERIAL} (демо-режим)`);
      case 'mdns':
        return ok('List of discovered mdns services\n');

      case 'install':
        return ok('Success\n');
      case 'uninstall': {
        const pkg = rest[rest.length - 1];
        const state = this.apps.get(pkg);
        if (state) state.installed = false;
        return ok('Success\n');
      }

      case 'push': {
        const [, remotePath] = rest;
        this.fileSystem.registerFile(remotePath, 1024 + Math.floor(Math.random() * 500_000));
        return ok('');
      }
      case 'pull': {
        const [remotePath, localPath] = rest;
        try {
          fs.writeFileSync(
            localPath,
            `Это файл-заглушка демо-режима ADB Shell.\nНастоящий adb pull скопировал бы реальный файл устройства.\nИсходный путь на устройстве: ${remotePath}\n`
          );
        } catch {
          return fail(`cannot create ${localPath}: демо-режим не смог записать локальный файл`);
        }
        return ok('');
      }

      case 'forward':
        return this.runForwardReverse('forward', rest);
      case 'reverse':
        return this.runForwardReverse('reverse', rest);

      case 'tcpip':
        return ok(`restarting in TCP mode port: ${rest[0] ?? '5555'}\n`);

      // MARK: "сырые" adb-команды из вкладки Shell (см. shellCommandLogic.ts) --
      // root/remount/reboot реальны только на хосте, у демо-устройства просто
      // всегда успешны.
      case 'root':
        return ok('restarting adbd as root\n');
      case 'remount':
        return ok('remount succeeded\n');
      case 'reboot':
        return ok('');

      default:
        return ok(NOT_SIMULATED_NOTE);
    }
  }

  private runForwardReverse(direction: 'forward' | 'reverse', rest: string[]): ProcessResult {
    const list = direction === 'forward' ? this.forwards : this.reverses;
    if (rest[0] === '--list') {
      const text = direction === 'forward' ? formatForwardList(DEMO_SERIAL, list) : formatReverseList(DEMO_SERIAL, list);
      return ok(text.length > 0 ? `${text}\n` : '');
    }
    if (rest[0] === '--remove') {
      const hostSpec = rest[1];
      const filtered = list.filter((e) => e.hostSpec !== hostSpec);
      if (direction === 'forward') this.forwards = filtered;
      else this.reverses = filtered;
      return ok('');
    }
    // Добавление: forward <hostSpec> <deviceSpec> / reverse <deviceSpec> <hostSpec> --
    // adb reverse принимает их в обратном порядке колонок относительно forward
    // (см. комментарий в PortForwardParser.ts), поэтому и тут симметрично.
    const [col1, col2] = rest;
    const entry: DemoForwardEntry = direction === 'forward' ? { hostSpec: col1, deviceSpec: col2 } : { hostSpec: col2, deviceSpec: col1 };
    const existing = direction === 'forward' ? this.forwards : this.reverses;
    const next = [...existing.filter((e) => e.hostSpec !== entry.hostSpec), entry];
    if (direction === 'forward') this.forwards = next;
    else this.reverses = next;
    return ok('');
  }

  // MARK: adb shell <command>

  private runShell(cmdLine: string): ProcessResult {
    if (cmdLine === 'getprop') return ok(formatGetpropAll(DEMO_GETPROP));
    if (cmdLine.startsWith('getprop ')) {
      const key = cmdLine.slice('getprop '.length).trim();
      return ok(DEMO_GETPROP[key] ?? '');
    }

    if (cmdLine === 'pm list packages') return ok(formatPmListPackages(this.installedApps()));
    if (cmdLine === 'pm list packages -3') return ok(formatPmListPackages(this.installedApps().filter((a) => !a.isSystem)));
    if (cmdLine === 'pm list packages -d') {
      const disabled = [...this.apps.values()].filter((s) => s.installed && !s.enabled).map((s) => s.profile);
      return ok(formatPmListPackages(disabled));
    }

    if (cmdLine === 'dumpsys package') return ok(formatDumpsysPackageBulk(this.installedApps()));
    if (cmdLine.startsWith('dumpsys package ')) {
      const pkg = cmdLine.slice('dumpsys package '.length).trim();
      const state = this.apps.get(pkg);
      if (!state || !state.installed) return ok('');
      return ok(formatDumpsysPackageDetail(state.profile, state.enabled, state.runtimeGranted));
    }

    if (cmdLine.startsWith('pm path ')) {
      const pkg = cmdLine.slice('pm path '.length).trim();
      const state = this.apps.get(pkg);
      if (!state || !state.installed) return fail(`package ${pkg} not found`);
      return ok(formatPmPath(state.profile));
    }

    if (cmdLine.startsWith('am force-stop ')) return ok('');
    if (cmdLine.startsWith('pm clear ')) return ok('Success\n');

    if (cmdLine.startsWith('pm enable ')) {
      const pkg = cmdLine.slice('pm enable '.length).trim();
      const state = this.apps.get(pkg);
      if (state) state.enabled = true;
      return ok(`Package ${pkg} enabled\n`);
    }
    if (cmdLine.startsWith('pm disable-user --user 0 ')) {
      const pkg = cmdLine.slice('pm disable-user --user 0 '.length).trim();
      const state = this.apps.get(pkg);
      if (state) state.enabled = false;
      return ok(`Package ${pkg} new state: disabled-user\n`);
    }

    if (cmdLine.startsWith('pm grant ') || cmdLine.startsWith('pm revoke ')) {
      const granted = cmdLine.startsWith('pm grant ');
      const rest = cmdLine.slice(cmdLine.indexOf(' ', 'pm '.length) + 1).trim();
      const [pkg, permission] = rest.split(' ');
      const state = this.apps.get(pkg);
      if (state) state.runtimeGranted[permission] = granted;
      return ok('');
    }

    if (cmdLine.startsWith('ls -la ')) {
      const path = cmdLine.slice('ls -la '.length).trim();
      const entries = this.fileSystem.list(path);
      if (!entries) return fail(`ls: ${path}: No such file or directory`);
      return ok(formatLsLa(entries));
    }
    if (cmdLine.startsWith('mkdir -p ')) {
      this.fileSystem.mkdir(cmdLine.slice('mkdir -p '.length).trim());
      return ok('');
    }
    if (cmdLine.startsWith('rm -rf ') || cmdLine.startsWith('rm -f ')) {
      const recursive = cmdLine.startsWith('rm -rf ');
      const path = cmdLine.slice(recursive ? 'rm -rf '.length : 'rm -f '.length).trim();
      this.fileSystem.remove(path, recursive);
      return ok('');
    }

    if (cmdLine === 'dumpsys cpuinfo') return ok(formatCpuInfo(this.jitteredCpuPercent()));
    if (cmdLine === 'cat /proc/meminfo') return ok(formatMemInfo(8_144_408, this.jitteredMemAvailableKB()));
    if (cmdLine === 'dumpsys battery') {
      const { level, charging } = this.jitteredBattery();
      return ok(formatBattery(level, 285, charging));
    }
    if (cmdLine === 'ps -A -o PID,PPID,USER,RSS,NAME') return ok(formatPs(this.demoProcessList()));
    if (cmdLine.startsWith('kill ')) return ok('');

    if (cmdLine === 'which su') return ok('');
    if (cmdLine.startsWith('settings get global package_verifier_user_consent')) return ok('1');

    if (cmdLine === 'ip route') return ok(formatIpRoute(DEMO_IP));

    if (cmdLine === 'dumpsys netstats detail') {
      return ok(formatNetstatsDetail(this.installedApps().map((a) => ({ uid: a.uid, rxBytes: fakeBytesFor(a.uid, 1), txBytes: fakeBytesFor(a.uid, 2) }))));
    }
    if (cmdLine === 'dumpsys usagestats') {
      return ok(
        formatUsageStats(this.installedApps().map((a) => ({ packageName: a.packageName, totalTimeSeconds: fakeBytesFor(a.uid, 3) % 7200 })))
      );
    }

    if (cmdLine === 'ls -1 /data/anr/') return ok(formatCrashListing(['anr_2025-08-15-10-30-00.txt']));
    if (cmdLine === 'ls -1 /data/tombstones/') return ok('');
    if (cmdLine.startsWith('tail -c 30000 ')) {
      const path = cmdLine.slice('tail -c 30000 '.length).trim();
      if (path.includes('anr_2025-08-15-10-30-00.txt')) return ok(FAKE_ANR_TRACE);
      return fail(`${path}: No such file or directory`);
    }

    // MARK: свободные команды -- пользователь набирает их сам во вкладке
    // Shell/Макросы/Intent-тестере, не через типизированный метод AdbService.
    if (cmdLine === 'id') return ok('uid=2000(shell) gid=2000(shell) groups=2000(shell)\n');
    if (cmdLine === 'whoami') return ok('shell\n');
    if (cmdLine === 'pwd') return ok('/\n');
    if (cmdLine === 'uptime') return ok('up time: 3 days, 4:12:09, 0 users, load average: 0.42, 0.38, 0.31\n');
    if (cmdLine === 'wm size') return ok('Physical size: 1344x2992\n');
    if (cmdLine.startsWith('am start')) return ok(`Starting: Intent { act=android.intent.action.VIEW }\n${NOT_SIMULATED_NOTE}\n`);
    if (cmdLine.startsWith('input ')) return ok('');
    if (cmdLine.startsWith('echo ')) return ok(`${cmdLine.slice('echo '.length)}\n`);

    return ok(NOT_SIMULATED_NOTE);
  }

  // MARK: "живые" метрики для Мониторинга

  private jitteredCpuPercent(): number {
    const t = Date.now() / 4000 + this.statsPhase;
    return Math.max(4, Math.min(70, 22 + Math.sin(t) * 14 + (Math.random() - 0.5) * 6));
  }

  private jitteredMemAvailableKB(): number {
    const t = Date.now() / 6000 + this.statsPhase;
    return Math.round(3_400_000 + Math.sin(t) * 400_000 + (Math.random() - 0.5) * 100_000);
  }

  private jitteredBattery(): { level: number; charging: boolean } {
    // Полный цикл "заряд/разряд" ~10 минут -- за время демо-сессии видно
    // движение стрелки, не статичное число.
    const t = (Date.now() / 300_000 + this.statsPhase) % 1;
    const charging = t < 0.5;
    const level = charging ? Math.round(40 + t * 2 * 55) : Math.round(95 - (t - 0.5) * 2 * 55);
    return { level: Math.max(5, Math.min(100, level)), charging };
  }

  private demoProcessList(): { pid: number; ppid: number; user: string; rssKB: number; name: string }[] {
    return this.installedApps().map((a, i) => ({
      pid: 2000 + i * 7,
      ppid: 1,
      user: `u0_a${a.uid % 1000}`,
      rssKB: 30_000 + ((a.uid * 37) % 90_000),
      name: a.packageName,
    }));
  }
}

/** Детерминированное псевдослучайное число от uid -- те же значения между
 * вызовами в рамках одной сессии (нет мигания цифр при каждом обновлении
 * вкладки), но разные между приложениями. */
function fakeBytesFor(uid: number, salt: number): number {
  const seed = uid * 2654435761 * salt;
  return Math.abs(seed % 50_000_000);
}

const FAKE_ANR_TRACE = `----- pid 2143 at 2025-08-15 10:30:00 -----
Cmd line: com.spotify.music
ABI: 'arm64'
(демо-режим: пример трейса, не результат реального сбоя)

"main" prio=5 tid=1 Blocked
  | state=S schedstat=( 0 0 0 ) utm=12 stm=4 core=0
  at com.spotify.music.playback.PlaybackController.awaitBuffer(PlaybackController.java:88)
  at com.spotify.music.playback.PlaybackController.play(PlaybackController.java:41)
  at android.os.Handler.dispatchMessage(Handler.java:106)
  at android.os.Looper.loop(Looper.java:246)
`;
