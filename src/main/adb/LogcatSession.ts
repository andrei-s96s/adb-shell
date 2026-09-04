// Порт Sources/AdbShell/Services/LogcatSession.swift — управляет одним живым
// процессом `adb logcat`, разбирая вывод построчно и отдавая готовые строки
// через колбэк (в main.ts колбэк пробрасывает их в renderer через IPC-событие).

import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';

export class LogcatSession {
  private process: ChildProcessWithoutNullStreams | undefined;
  private buffer = '';

  constructor(
    private readonly adbPath: string,
    private readonly serial: string
  ) {}

  get isRunning(): boolean {
    return this.process !== undefined && !this.process.killed;
  }

  start(onLine: (line: string) => void): void {
    this.stop();

    const child = spawn(this.adbPath, ['-s', this.serial, 'logcat', '-v', 'threadtime'], { windowsHide: true });
    this.process = child;

    child.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      let newlineIndex: number;
      // eslint-disable-next-line no-cond-assign
      while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, newlineIndex);
        this.buffer = this.buffer.slice(newlineIndex + 1);
        if (line.length > 0) onLine(line);
      }
    });

    child.on('error', (error) => {
      onLine(`[ошибка запуска adb logcat: ${error.message}]`);
    });
  }

  /** Очищает лог-буфер УСТРОЙСТВА (adb logcat -c), не влияет на текущий стрим.
   * 'error' обязателен — необработанное 'error' на ChildProcess (EventEmitter)
   * иначе бросает исключение и валит весь main-процесс Electron, если adb
   * вдруг не нашёлся/не смог запуститься в этот момент. */
  clearDeviceBuffer(): void {
    const child = spawn(this.adbPath, ['-s', this.serial, 'logcat', '-c'], { windowsHide: true });
    child.on('error', () => {
      /* тихо игнорируем — это разовая best-effort команда, откуда её вызвали
       * уже не отследить колбэком, а падать из-за неё нельзя. */
    });
  }

  stop(): void {
    if (this.process) {
      // Снимаем слушатель ПЕРЕД kill(): SIGTERM не мгновенен, и без этого
      // строки, ещё летящие от уже "остановленного" процесса, попадали бы в
      // onLine() старой сессии — а вызывающая сторона (main.ts) шлёт их в
      // renderer под тем же serial, что и новый стрим, если start() вызвали
      // сразу следом. Поймано разбором логики, не флаки-тестом на таймингах.
      this.process.stdout.removeAllListeners('data');
      this.process.removeAllListeners('error');
      this.process.kill();
    }
    this.process = undefined;
    this.buffer = '';
  }
}
