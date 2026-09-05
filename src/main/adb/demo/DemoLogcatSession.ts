// Тот же публичный интерфейс, что у LogcatSession (start/stop/isRunning/
// clearDeviceBuffer), но вместо спавна `adb logcat` -- периодически
// генерирует правдоподобные строки в формате `logcat -v threadtime`
// (`MM-DD HH:MM:SS.mmm  PID  TID L Tag: message`), который уже умеет
// разбирать logLineParser.ts (см. там parseLogLine) -- вкладка Logcat не
// отличает демо-строки от настоящих.

const TAGS_AND_MESSAGES: { tag: string; level: 'V' | 'D' | 'I' | 'W' | 'E'; message: string }[] = [
  { tag: 'ActivityManager', level: 'I', message: 'Displayed com.spotify.music/.MainActivity: +312ms' },
  { tag: 'Spotify', level: 'I', message: 'Now playing "Demo Track" by Demo Artist' },
  { tag: 'OkHttp', level: 'D', message: '--> GET https://api.spotify.com/v1/me/player HTTP/1.1' },
  { tag: 'WindowManager', level: 'V', message: 'setWindowState: token=android.os.BinderProxy visible=true' },
  { tag: 'PowerManagerService', level: 'D', message: 'acquireWakeLock: PARTIAL_WAKE_LOCK flags=0x1' },
  { tag: 'WhatsApp', level: 'I', message: 'Message sync completed, 0 new messages' },
  { tag: 'InputMethodManager', level: 'V', message: 'showSoftInput() view=android.widget.EditText' },
  { tag: 'System.err', level: 'W', message: 'Failed to connect to demo-analytics.example.com (демо-режим: сеть отключена)' },
  { tag: 'GoogleApiManager', level: 'D', message: 'Connection not available to run queued client action' },
  { tag: 'ConnectivityService', level: 'I', message: 'NetworkAgentInfo [WIFI () - 108] validation successful' },
  { tag: 'AndroidRuntime', level: 'E', message: 'демо-режим: пример строки уровня Error, не настоящий сбой' },
  { tag: 'BatteryService', level: 'D', message: 'setBatteryLevel: level=76 scale=100 status=2' },
  { tag: 'zygote64', level: 'I', message: 'Explicit concurrent copying GC freed 2841(612KB) AllocSpace' },
];

export class DemoLogcatSession {
  private timer: ReturnType<typeof setInterval> | undefined;
  private pids: number[];

  constructor(_adbPath: string, _serial: string) {
    this.pids = [2143, 2401, 2588, 2977, 3102];
  }

  get isRunning(): boolean {
    return this.timer !== undefined;
  }

  start(onLine: (line: string) => void): void {
    this.stop();
    // Первая строка сразу -- иначе экран несколько секунд выглядит пустым/сломанным.
    onLine(this.nextLine());
    this.timer = setInterval(() => onLine(this.nextLine()), 400 + Math.random() * 700);
  }

  clearDeviceBuffer(): void {
    // Реальный `adb logcat -c` очищает буфер УСТРОЙСТВА, а не текущий стрим
    // (см. комментарий в LogcatSession.ts) -- у демо-устройства буфера,
    // который можно было бы "очистить", нет, так что это осознанный no-op.
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private nextLine(): string {
    const now = new Date();
    const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
    const timestamp = `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(
      now.getSeconds()
    )}.${pad(now.getMilliseconds(), 3)}`;
    const pid = this.pids[Math.floor(Math.random() * this.pids.length)];
    const tid = pid + Math.floor(Math.random() * 40);
    const entry = TAGS_AND_MESSAGES[Math.floor(Math.random() * TAGS_AND_MESSAGES.length)];
    return `${timestamp}  ${pid}  ${tid} ${entry.level} ${entry.tag}: ${entry.message}`;
  }
}
