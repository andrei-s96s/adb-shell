// Порт Sources/AdbShell/Services/ADBService.swift — тонкая обёртка над CLI
// `adb`, вызывающая процесс и парсящая его вывод. Намеренно не импортирует
// 'electron' — должен оставаться тестируемым напрямую через `node --test`,
// без запуска в Electron-рантайме.

import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
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
import { singleQuoted, tokenizeArgs } from './parsers/ShellQuoting';
import { parseApkPaths } from './parsers/ApkPathParser';
import { parseVersionCodes } from './parsers/VersionCodeParser';

export class AdbCommandError extends Error {}

// Раньше почти все методы ниже не передавали timeoutMs вовсе -- если
// устройство подвисало на команде (заблокированный экран, ожидающий
// системный диалог, отвалившийся Wi-Fi у беспроводного adb...), конкретное
// действие в UI просто крутилось бесконечно без единого шанса на ошибку.
// run() ниже применяет это значение САМ, когда вызывающий код не передал
// options.timeoutMs явно -- поэтому большинству методов не нужно менять
// ничего специально, они получают защиту "бесплатно". У кого таймаут уже
// был длиннее (install/push/pull/installedVersionCodes) -- он остаётся
// длиннее. shell()/runRaw() -- ЕДИНСТВЕННОЕ намеренное исключение
// (timeoutMs: 0, см. комментарий там): это сырой ввод пользователя во
// вкладке Shell/макросах, который вправе выполняться сколько угодно.
const DEFAULT_TIMEOUT_MS = 30_000;

// Верхний предел накопленного stdout+stderr одного вызова run() -- в
// отличие от timeoutMs, применяется ко ВСЕМ вызовам без исключения, в т.ч.
// shell()/runRaw() с timeoutMs: 0 (см. комментарий выше). Без него
// "болтливая" команда копила бы вывод в JS-строку без остановки, пока не
// уронит по памяти весь main-процесс, а не только вкладку Shell.
const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;

// Команда и разделитель для deviceStatsAndProcesses() ниже -- экспортированы,
// чтобы DemoAdbService.ts мог распознать ровно ЭТУ строку среди "сырых"
// shell-команд и собрать демо-эквивалент вывода тем же разделителем, не
// дублируя саму команду по отдельности в двух местах.
export const MONITOR_STATS_SEPARATOR = '__ADBSHELL_MONITOR_SEP__';
export const MONITOR_STATS_COMMAND = [
  'dumpsys cpuinfo',
  'cat /proc/meminfo',
  'dumpsys battery',
  'ps -A -o PID,PPID,USER,RSS,NAME',
].join(`; echo ${MONITOR_STATS_SEPARATOR}; `);

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

  run(
    args: string[],
    options: { serial?: string; timeoutMs?: number; onSpawn?: (cancel: () => void) => void } = {}
  ): Promise<ProcessResult> {
    const allArgs = options.serial ? ['-s', options.serial, ...args] : args;
    // timeoutMs: 0 -- явное "без таймаута" (см. shell()/runRaw()), undefined --
    // "вызывающий код не думал об этом", получает разумный дефолт (см.
    // DEFAULT_TIMEOUT_MS выше). Любое другое число -- используется как есть.
    const timeoutMs = options.timeoutMs === 0 ? undefined : options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
      // StringDecoder (не chunk.toString('utf8') на каждом отдельном
      // Buffer) -- если многобайтовый UTF-8 символ (кириллица в имени
      // файла из `adb shell ls`, эмодзи в названии приложения) окажется
      // разрезан ровно на границе двух 'data'-событий, toString('utf8') на
      // обрывке декодирует его в U+FFFD молча, ещё до того, как вывод
      // попадёт в парсеры -- StringDecoder копит незавершённый хвост байт
      // и достраивает символ следующим чанком.
      const stdoutDecoder = new StringDecoder('utf8');
      const stderrDecoder = new StringDecoder('utf8');
      let settled = false;
      let timedOut = false;
      let cancelled = false;
      let outputOverflowed = false;
      let outputBytes = 0;
      // onSpawn -- единственный способ для вызывающей стороны прервать ЭТОТ
      // конкретный запуск, пока он ещё выполняется (run() иначе отдаёт
      // результат только промисом, разрешающимся по завершении). cancel()
      // -- симметрично kill() по таймауту ниже, но со своим отдельным
      // флагом, чтобы close-хендлер мог отличить "отменено явно" от
      // "истекло время" и дать вызывающей стороне понятную причину, а не
      // тихо зарезолвить пустым/обрезанным результатом. Нужен shell()/
      // runRaw() ниже для отмены зависшей shell-команды по serial -- см.
      // killShell().
      const cancel = (): void => {
        if (settled) return;
        cancelled = true;
        child.kill();
      };
      options.onSpawn?.(cancel);
      const timer = timeoutMs
        ? setTimeout(() => {
            if (settled) return;
            timedOut = true;
            child.kill();
          }, timeoutMs)
        : undefined;

      // Верхний предел на накопленный вывод -- отдельно от таймаута, потому
      // что shell()/runRaw() намеренно вызывают run() с timeoutMs: 0 (см.
      // комментарий там), а run() используется вообще для всех adb-команд
      // сервиса. Без предела "болтливая" команда (`cat /dev/urandom`,
      // `find /` на устройстве с миллионом файлов) копила бы вывод в
      // обычную JS-строку без остановки, пока не уронит по памяти весь
      // main-процесс Electron -- не только вкладку Shell, а всё приложение
      // со всеми окнами. 200 МБ выбраны с большим запасом: любой
      // структурированный вывод (dumpsys, getprop, списки пакетов),
      // который дальше идёт в парсеры, на практике на пару порядков меньше.
      const trackOutput = (chunkLength: number): boolean => {
        if (outputOverflowed) return true;
        outputBytes += chunkLength;
        if (outputBytes > MAX_OUTPUT_BYTES) {
          outputOverflowed = true;
          child.kill();
          return true;
        }
        return false;
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        if (trackOutput(chunk.length)) return;
        stdout += stdoutDecoder.write(chunk);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        if (trackOutput(chunk.length)) return;
        stderr += stderrDecoder.write(chunk);
      });
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
        // Раньше kill() по таймауту всё равно резолвил close как обычное
        // завершение -- пользователь видел невнятную ошибку про пустой
        // вывод (или вообще ничего) вместо понятной причины. Явно
        // отклоняем с сообщением, объясняющим, что произошло, а не что
        // именно устройство ответило (оно ничего не успело ответить).
        stdout += stdoutDecoder.end();
        stderr += stderrDecoder.end();
        if (timedOut) {
          reject(new AdbCommandError(`adb не ответил за ${Math.round(timeoutMs! / 1000)}с -- устройство могло зависнуть, потерять соединение или ждать системный диалог на экране`));
          return;
        }
        if (cancelled) {
          reject(new AdbCommandError('Команда отменена пользователем'));
          return;
        }
        if (outputOverflowed) {
          reject(new AdbCommandError(`Вывод команды превысил ${Math.round(MAX_OUTPUT_BYTES / (1024 * 1024))} МБ и был прерван`));
          return;
        }
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

  /** `adb kill-server && adb start-server` -- самое частое реальное лекарство
   * от "adb: inaccessible or not found" / устройство пропало из списка без
   * видимой причины / несколько параллельных adb-серверов на разных портах
   * мешают друг другу. Раньше единственный способ был идти в терминал --
   * кнопка в UI (см. main.ts) делает то же самое в один клик. start-server
   * технически необязателен (adb сам поднимет сервер при следующей же
   * команде), но явный вызов возвращает уже готовый к работе adb сразу,
   * а не откладывает задержку старта на первый следующий клик пользователя. */
  async restartServer(): Promise<void> {
    await this.run(['kill-server'], { timeoutMs: 10_000 });
    await this.run(['start-server'], { timeoutMs: 10_000 });
  }

  // ВАЖНО про все методы ниже, вызывающие run(['shell', ...]) с одним из
  // своих аргументов (dirPath/targetPath/filePath/packageName/permission):
  // `adb shell a b c` не выполняет `a`, `b`, `c` как отдельные argv-элементы
  // на устройстве -- adb склеивает всё после `shell` ПРОБЕЛОМ в одну строку
  // и отдаёт её на исполнение shell'у устройства (то же, что уже объяснено
  // в ShellQuoting.ts и учтено в openDeepLink() ниже). Значит любой такой
  // аргумент, содержащий пробел или спецсимвол shell'а (`;`, `` ` ``, `$()`,
  // `|`, `&&`...), не остаётся "просто путём/строкой" -- он меняет саму
  // структуру команды. Практический сценарий: приложение на телефоне
  // создаёт файл/папку с именем вроде "a; rm -rf /sdcard" -- пользователь,
  // ничего не подозревая, просто открывает эту папку во вкладке "Файлы",
  // и `ls -la a; rm -rf /sdcard` выполняется на устройстве целиком.
  // Поэтому такие значения оборачиваются в singleQuoted() перед подстановкой
  // -- ЕДИНСТВЕННОЕ исключение: shell()/runRaw() ниже, где сырой ввод
  // пользователя (вкладка Shell) -- это и есть вся суть команды, а не
  // "путь", оборачивать там нечего и незачем.
  async shell(serial: string, command: string): Promise<string> {
    // timeoutMs: 0 -- вкладка Shell это фактически терминал, пользователь
    // вправе сам запустить что-то долгое (`sleep 30 && ...`, ожидание
    // загрузки и т.п.) -- в отличие от структурированных методов ниже
    // (у них есть DEFAULT_TIMEOUT_MS, см. комментарий над классом), здесь
    // нет заранее известного "должно быть быстро".
    const result = await this.runTrackedShell(serial, ['shell', command]);
    return combinedOutput(result);
  }

  /** Выполняет "сырую" adb-команду -- `adb -s <serial> <argsLine>`, а НЕ
   * `adb -s <serial> shell <argsLine>`. Нужно для команд вроде `root` или
   * `remount`, которые являются подкомандами самого adb, а не программами
   * на устройстве -- в отличие от shell(), не заворачивает текст в shell
   * устройства. Та же quote-aware токенизация (tokenizeArgs), что и в
   * MacroRunner.run() (src/main/macros/MacroRunner.ts) -- используется
   * вкладкой Shell, когда пользователь набирает команду с префиксом `adb `,
   * как в терминале. */
  async runRaw(serial: string, argsLine: string): Promise<string> {
    const tokens = tokenizeArgs(argsLine);
    // timeoutMs: 0 -- та же причина, что и в shell() выше (в т.ч. используется
    // макросами, где отдельный шаг вроде `adb wait-for-device` намеренно
    // ждёт неопределённое время).
    const result = await this.runTrackedShell(serial, tokens);
    return combinedOutput(result);
  }

  /** shell()/runRaw() -- ЕДИНСТВЕННОЕ исключение из общего DEFAULT_TIMEOUT_MS
   * (timeoutMs: 0, см. комментарии там), поэтому зависшая команда раньше
   * не имела вообще никакого выхода, кроме перезапуска всего приложения.
   * Отслеживает cancel() (см. run()) активного вызова по serial, чтобы
   * killShell() ниже мог явно прервать его по нажатию кнопки в UI. Один
   * активный вызов на serial ожидается (UI дизейблит "Выполнить", пока
   * предыдущий не завершился) -- защитная проверка при очистке всё равно
   * не даёт случайно затереть трассировку более нового вызова, если он
   * всё же пересёкся (например, шаг макроса на том же устройстве). */
  private activeShellCancellers = new Map<string, () => void>();

  private runTrackedShell(serial: string, args: string[]): Promise<ProcessResult> {
    let myCancel: (() => void) | undefined;
    const promise = this.run(args, {
      serial,
      timeoutMs: 0,
      onSpawn: (cancel) => {
        myCancel = cancel;
        this.activeShellCancellers.set(serial, cancel);
      },
    });
    const cleanup = (): void => {
      if (myCancel && this.activeShellCancellers.get(serial) === myCancel) {
        this.activeShellCancellers.delete(serial);
      }
    };
    promise.then(cleanup, cleanup);
    return promise;
  }

  /** Явно прерывает зависшую shell()/runRaw() команду для serial, если
   * такая сейчас выполняется. Возвращает false, если для этого serial
   * сейчас ничего не выполняется -- не ошибка, просто нечего прерывать
   * (например, пользователь успел кликнуть "Отмена" уже после того, как
   * команда сама завершилась). */
  killShell(serial: string): boolean {
    const cancel = this.activeShellCancellers.get(serial);
    if (!cancel) return false;
    cancel();
    return true;
  }

  // MARK: Bugreport

  /** Отслеживает cancel() активного `adb bugreport` по serial -- ОТДЕЛЬНАЯ
   * от activeShellCancellers карта, а не переиспользование runTrackedShell()/
   * killShell() выше: у обоих ровно один активный вызов ожидается на serial,
   * но это два независимых действия пользователя (вкладка Shell и кнопка
   * "Bugreport…" в Мониторинге) -- если бы они делили один слот по serial,
   * запуск одного втихую перехватывал бы "Отмена" у другого. */
  private activeBugreportCancellers = new Map<string, () => void>();

  /** `adb bugreport <path>` -- полный диагностический архив устройства
   * (логи, dumpsys, состояние системы целиком), который сама adb пишет
   * напрямую в указанный локальный файл. Может занимать от десятков секунд
   * до нескольких минут в зависимости от устройства -- timeoutMs: 0, та же
   * причина, что и у shell()/runRaw() (нет заранее известного "должно быть
   * быстро"), плюс killBugreport() ниже даёт explicit способ прервать. */
  async bugreport(serial: string, outputPath: string): Promise<void> {
    let myCancel: (() => void) | undefined;
    const promise = this.run(['bugreport', outputPath], {
      serial,
      timeoutMs: 0,
      onSpawn: (cancel) => {
        myCancel = cancel;
        this.activeBugreportCancellers.set(serial, cancel);
      },
    });
    const cleanup = (): void => {
      if (myCancel && this.activeBugreportCancellers.get(serial) === myCancel) {
        this.activeBugreportCancellers.delete(serial);
      }
    };
    promise.then(cleanup, cleanup);
    const result = await promise;
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
  }

  /** Явно прерывает `adb bugreport`, если он сейчас выполняется для этого
   * serial -- тот же контракт, что и у killShell() (false, если нечего
   * прерывать, не ошибка). */
  killBugreport(serial: string): boolean {
    const cancel = this.activeBugreportCancellers.get(serial);
    if (!cancel) return false;
    cancel();
    return true;
  }

  /** Открывает deep link на устройстве. Используется intent-тестером. */
  async openDeepLink(serial: string, uri: string): Promise<string> {
    return this.shell(serial, `am start -a android.intent.action.VIEW -d ${singleQuoted(uri)}`);
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
    const result = await this.run(['shell', 'dumpsys', 'package', singleQuoted(packageName)], { serial });
    return parseAppDetail(packageName, result.stdout);
  }

  /** Аналог ADBService.installedVersionCodes(serial:) -- один bulk-дамп
   * versionCode для ВСЕХ пакетов сразу (вместо dumpsys на каждый пакет по
   * отдельности), используется массовой сверкой с F-Droid. */
  async installedVersionCodes(serial: string): Promise<Record<string, number>> {
    const result = await this.run(['shell', 'dumpsys', 'package'], { serial, timeoutMs: 60_000 });
    return parseVersionCodes(result.stdout);
  }

  /** Аналог ADBService.apkPaths(serial:packageName:) -- пути к установленным
   * APK пакета на устройстве (split APK может дать несколько строк). */
  async apkPaths(serial: string, packageName: string): Promise<string[]> {
    const result = await this.run(['shell', 'pm', 'path', singleQuoted(packageName)], { serial });
    const paths = parseApkPaths(result.stdout);
    if (paths.length === 0) {
      throw new AdbCommandError(combinedOutput(result).length > 0 ? combinedOutput(result) : 'Путь к APK не найден');
    }
    return paths;
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
    await this.run(['shell', 'am', 'force-stop', singleQuoted(packageName)], { serial });
  }

  async clearData(serial: string, packageName: string): Promise<void> {
    const result = await this.run(['shell', 'pm', 'clear', singleQuoted(packageName)], { serial });
    if (result.stdout.includes('Failed')) {
      throw new AdbCommandError(combinedOutput(result));
    }
  }

  async setEnabled(serial: string, packageName: string, enabled: boolean): Promise<void> {
    const subcommand = enabled ? 'enable' : 'disable-user';
    const args = ['shell', 'pm', subcommand];
    if (!enabled) args.push('--user', '0');
    args.push(singleQuoted(packageName));
    const result = await this.run(args, { serial });
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
  }

  async grantPermission(serial: string, packageName: string, permission: string): Promise<void> {
    const result = await this.run(['shell', 'pm', 'grant', singleQuoted(packageName), singleQuoted(permission)], { serial });
    if (result.exitCode !== 0 || result.stderr.length > 0) {
      throw new AdbCommandError(combinedOutput(result));
    }
  }

  async revokePermission(serial: string, packageName: string, permission: string): Promise<void> {
    const result = await this.run(['shell', 'pm', 'revoke', singleQuoted(packageName), singleQuoted(permission)], { serial });
    if (result.exitCode !== 0 || result.stderr.length > 0) {
      throw new AdbCommandError(combinedOutput(result));
    }
  }

  // MARK: Файлы устройства

  async listDirectory(serial: string, dirPath: string): Promise<RemoteFile[]> {
    const result = await this.run(['shell', 'ls', '-la', singleQuoted(dirPath)], { serial });
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
    const result = await this.run(['shell', 'mkdir', '-p', singleQuoted(dirPath)], { serial });
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
  }

  async removeRemote(serial: string, targetPath: string, recursive: boolean): Promise<void> {
    const args = ['shell', 'rm', recursive ? '-rf' : '-f', singleQuoted(targetPath)];
    const result = await this.run(args, { serial });
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
  }

  // MARK: Мониторинг

  /** Вкладка Мониторинг опрашивает это раз в POLL_INTERVAL_MS (2с, см.
   * monitor.ts), пока открыта -- раньше deviceStats() и runningProcesses()
   * были отдельными методами и вместе спавнили 4 ADB-процесса НА КАЖДЫЙ
   * тик (dumpsys cpuinfo + cat /proc/meminfo + dumpsys battery + ps -A),
   * непрерывно, пока экран открыт. Склеены в один `adb shell` вызов --
   * четыре команды через ';' в одной строке аргументом (та же техника, что
   * уже используется для сырого пользовательского ввода в shell()/
   * runRaw()), разделены MONITOR_STATS_SEPARATOR в выводе. ';' (не '&&') --
   * осознанно: одна упавшая команда не должна мешать остальным трём
   * выполниться и попасть в вывод. */
  async deviceStatsAndProcesses(serial: string): Promise<{ stats: DeviceStats; processes: RunningProcess[] }> {
    const result = await this.run(['shell', MONITOR_STATS_COMMAND], { serial });
    const [cpuOutput = '', memOutput = '', batteryOutput = '', processOutput = ''] = result.stdout
      .split(MONITOR_STATS_SEPARATOR)
      .map((s) => s.trim());
    return {
      stats: parseDeviceStats(cpuOutput, memOutput, batteryOutput),
      processes: parseProcessList(processOutput),
    };
  }

  async killProcess(serial: string, pid: number): Promise<void> {
    await this.run(['shell', 'kill', String(pid)], { serial });
  }

  // MARK: Безопасность устройства

  /** Аналог ADBService.securityInfo(serial:) — локальные признаки
   * целостности устройства (root/разлочка/debuggable). Полноценный
   * SafetyNet/Play Integrity с устройства через adb не выполнить, это
   * удалённая проверка на серверах Google.
   *
   * ro.boot.verifiedbootstate/ro.boot.flash.locked/ro.debuggable/ro.secure
   * раньше запрашивались по отдельности (`getprop <key>` на каждое) --
   * все четыре уже есть в одном бесплатном bulk-дампе allProperties()
   * (`getprop` без аргументов), который эта же карточка "Безопасность"
   * всё равно логически про то же устройство прямо сейчас. which
   * su/settings get -- не getprop-свойства, эти два спавна остаются
   * отдельными командами. */
  async securityInfo(serial: string): Promise<DeviceSecurityInfo> {
    const [properties, suCheck, playProtect] = await Promise.all([
      this.allProperties(serial),
      this.run(['shell', 'which', 'su'], { serial }),
      this.run(['shell', 'settings', 'get', 'global', 'package_verifier_user_consent'], { serial }),
    ]);
    const trim = (r: ProcessResult) => r.stdout.trim();
    const propValue = (key: string): string => properties.find((p) => p.key === key)?.value ?? '';

    const verifiedBootValue = propValue('ro.boot.verifiedbootstate');
    const flashLockedValue = propValue('ro.boot.flash.locked');
    const debuggableValue = propValue('ro.debuggable');
    const secureValue = propValue('ro.secure');
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

  /** Начало файла трейса — полные tombstone-файлы могут быть большими, а
   * самое важное (build fingerprint, сигнал/код/fault-адрес, регистры,
   * backtrace упавшего потока) идёт в самом начале; в конце -- список
   * открытых файлов и карта памяти (может быть огромной сама по себе,
   * особенно при большом числе загруженных библиотек), которые почти
   * никогда не то, что нужно увидеть первым. Раньше брался ХВОСТ (tail) --
   * для больших файлов это как раз обрезало самую полезную часть. */
  async readCrashTrace(serial: string, filePath: string): Promise<string> {
    const result = await this.run(['shell', 'head', '-c', '30000', singleQuoted(filePath)], { serial });
    if (result.exitCode !== 0) throw new AdbCommandError(combinedOutput(result));
    return result.stdout;
  }

  // MARK: Скриншот

  /** Аналог ADBService.screenshot(serial:) — `exec-out screencap -p` отдаёт
   * сырой PNG в stdout. В отличие от run(), собирает stdout как Buffer, а не
   * UTF-8 строку — иначе бинарные байты PNG были бы необратимо испорчены
   * перекодировкой (тот же повод, по которому Swift-версия обходит здесь
   * общий текстовый путь и работает с Process напрямую). Таймаут — тот же
   * DEFAULT_TIMEOUT_MS и та же причина, что и в run(): без него зависшее
   * устройство (заблокированный экран, отвалившийся Wi-Fi ровно во время
   * screencap) заставляло бы кнопку "Скриншот" и глобальный хоткей ждать
   * вечно без единого шанса на ошибку. */
  screenshot(serial: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(this.adbPath, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true });
      } catch (error) {
        reject(new AdbCommandError(`Couldn't launch adb: ${(error as Error).message}`));
        return;
      }
      const chunks: Buffer[] = [];
      let settled = false;
      let timedOut = false;
      const timer = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        child.kill();
      }, DEFAULT_TIMEOUT_MS);
      child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new AdbCommandError(`Couldn't launch adb: ${error.message}`));
      });
      child.on('close', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (timedOut) {
          reject(new AdbCommandError(`adb не ответил за ${Math.round(DEFAULT_TIMEOUT_MS / 1000)}с -- устройство могло зависнуть, потерять соединение или ждать системный диалог на экране`));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
  }
}
