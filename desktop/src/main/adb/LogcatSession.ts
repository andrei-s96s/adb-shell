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

  /** Очищает лог-буфер УСТРОЙСТВА (adb logcat -c), не влияет на текущий стрим. */
  clearDeviceBuffer(): void {
    spawn(this.adbPath, ['-s', this.serial, 'logcat', '-c'], { windowsHide: true });
  }

  stop(): void {
    this.process?.kill();
    this.process = undefined;
    this.buffer = '';
  }
}
