import { adbApi, el, errorMessage } from '../api.js';
import type { DeviceStats, RunningProcess, SecurityFinding, AppUsageStat } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';
import { onTabVisibilityChanged } from '../tabs.js';

const POLL_INTERVAL_MS = 2000;
const HISTORY_LENGTH = 30;
/** Сколько точек держим для CSV-экспорта -- при интервале 2с это ~4 минуты,
 * тот же лимит, что и DeviceStatsViewModel.historyLimit в Swift-версии. */
const CSV_HISTORY_LIMIT = 120;

let statusEl: HTMLDivElement;
let bugreportBtn: HTMLButtonElement;
let bugreportCancelBtn: HTMLButtonElement;
let bugreportStatusEl: HTMLSpanElement;
let cpuValueEl: HTMLDivElement;
let memValueEl: HTMLDivElement;
let batteryValueEl: HTMLDivElement;
let sparklineEl: SVGPolylineElement;
let processListEl: HTMLUListElement;
let usageListEl: HTMLUListElement;
let securityListEl: HTMLUListElement;

let pollTimer: ReturnType<typeof setInterval> | undefined;
let cpuHistory: number[] = [];
let statsHistory: DeviceStats[] = [];
// Тумблер видимости вкладки -- initTabs() (renderer.ts) вызывается раньше
// initMonitorScreen() и производит первую активацию ДО того, как этот
// экран успевает подписаться на onTabVisibilityChanged, поэтому исходное
// значение здесь ("true") ниже сразу перезаписывается реальным состоянием
// прямо из DOM, а не остаётся угаданным дефолтом.
let tabVisible = true;
/** Serial, для которого сейчас идёт adb bugreport -- нужен кнопке "Отмена"
 * (тот же принцип, что и runningSerial/killShell в shellScreen.ts). */
let runningBugreportSerial: string | undefined;

export function initMonitorScreen(): void {
  statusEl = el<HTMLDivElement>('monitor-status');
  cpuValueEl = el<HTMLDivElement>('monitor-cpu');
  memValueEl = el<HTMLDivElement>('monitor-mem');
  batteryValueEl = el<HTMLDivElement>('monitor-battery');
  sparklineEl = document.getElementById('monitor-sparkline-points') as unknown as SVGPolylineElement;
  processListEl = el<HTMLUListElement>('monitor-process-list');
  usageListEl = el<HTMLUListElement>('monitor-usage-list');
  securityListEl = el<HTMLUListElement>('monitor-security-list');
  el<HTMLButtonElement>('monitor-export-csv').addEventListener('click', () => void exportCsv());
  bugreportBtn = el<HTMLButtonElement>('monitor-bugreport');
  bugreportCancelBtn = el<HTMLButtonElement>('monitor-bugreport-cancel');
  bugreportStatusEl = el<HTMLSpanElement>('monitor-bugreport-status');
  bugreportBtn.addEventListener('click', () => void runBugreport());
  bugreportCancelBtn.addEventListener('click', () => {
    if (runningBugreportSerial) void adbApi.killBugreport(runningBugreportSerial);
  });

  tabVisible = document.getElementById('tab-monitor')?.classList.contains('active') ?? true;

  onDeviceChanged((serial) => {
    stopPolling();
    cpuHistory = [];
    statsHistory = [];
    updateSparkline();
    cpuValueEl.textContent = '—';
    memValueEl.textContent = '—';
    batteryValueEl.textContent = '—';
    processListEl.innerHTML = '';
    usageListEl.innerHTML = '';
    securityListEl.innerHTML = '';
    bugreportBtn.disabled = !serial;
    if (serial) {
      // Секции ниже одноразовые (не поллинг) -- незачем гейтить их
      // видимостью вкладки, они просто готовят данные к моменту, когда
      // пользователь заглянет на вкладку.
      if (tabVisible) startPolling(serial);
      void loadSecurity(serial);
      void loadUsageStats(serial);
    } else {
      statusEl.textContent = 'Нет подключённого устройства — выберите устройство слева';
    }
  });

  // tabs.ts переключал вкладки чисто CSS-классом, без единого сигнала
  // "вкладка скрылась/показалась" -- поллинг (4 adb-запроса каждые 2с,
  // см. AdbService.deviceStatsAndProcesses) продолжал молотить в фоне,
  // пока пользователь работал в Files/Apps/Shell. Возобновление НЕ сбрасывает
  // alertArmState (в отличие от startPolling при смене устройства) -- иначе
  // каждое возвращение на вкладку с всё ещё высоким CPU/низким зарядом
  // перевзводило бы уже сработавшее уведомление и слало бы его заново без
  // единого реального изменения показателя.
  onTabVisibilityChanged((tabId, isVisible) => {
    if (tabId !== 'monitor') return;
    tabVisible = isVisible;
    if (!isVisible) {
      stopPolling();
      return;
    }
    const serial = getCurrentSerial();
    if (serial && !pollTimer) beginPollingLoop(serial);
  });
}

function beginPollingLoop(serial: string): void {
  void poll(serial);
  pollTimer = setInterval(() => void poll(serial), POLL_INTERVAL_MS);
}

function startPolling(serial: string): void {
  void adbApi.resetAlertArm();
  beginPollingLoop(serial);
}

function stopPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
}

async function poll(serial: string): Promise<void> {
  // Устройство могло смениться, пока летел предыдущий запрос — не затираем
  // данные другого устройства результатом, пришедшим слишком поздно.
  try {
    const { stats, processes } = await adbApi.deviceStatsAndProcesses(serial);
    if (getCurrentSerial() !== serial) return;
    renderStats(stats);
    renderProcesses(processes, serial);
    statusEl.textContent = '';

    statsHistory.push(stats);
    if (statsHistory.length > CSV_HISTORY_LIMIT) statsHistory.splice(0, statsHistory.length - CSV_HISTORY_LIMIT);
    adbApi.checkAlertThresholds(stats).catch(() => {});
  } catch (error) {
    if (getCurrentSerial() !== serial) return;
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

async function loadSecurity(serial: string): Promise<void> {
  try {
    const findings = await adbApi.securityInfo(serial);
    if (getCurrentSerial() !== serial) return;
    renderSecurity(findings);
  } catch {
    // Секция вторичная -- молча оставляем пустой список при ошибке.
  }
}

function renderSecurity(findings: SecurityFinding[]): void {
  securityListEl.innerHTML = '';
  const icon = { ok: '✓', warning: '⚠', critical: '✕' } as const;
  for (const finding of findings) {
    const li = document.createElement('li');
    li.className = 'row';
    const label = document.createElement('span');
    label.textContent = `${icon[finding.level]} ${finding.messageKey}`;
    li.appendChild(label);
    li.style.color =
      finding.level === 'critical' ? 'var(--cp-crimson)' : finding.level === 'warning' ? 'var(--cp-gold)' : 'var(--cp-emerald)';
    securityListEl.appendChild(li);
  }
}

async function loadUsageStats(serial: string): Promise<void> {
  try {
    const stats = await adbApi.usageStats(serial);
    if (getCurrentSerial() !== serial) return;
    renderUsageStats(stats);
  } catch {
    // Вторичная секция -- ошибку не показываем поверх основной панели.
  }
}

function renderUsageStats(stats: AppUsageStat[]): void {
  usageListEl.innerHTML = '';
  const sorted = [...stats].sort((a, b) => b.totalSeconds - a.totalSeconds).slice(0, 15);
  if (sorted.length === 0) {
    usageListEl.innerHTML = '<li class="hint">Нет данных экранного времени</li>';
    return;
  }
  for (const stat of sorted) {
    const li = document.createElement('li');
    li.className = 'row';
    const label = document.createElement('span');
    label.textContent = stat.packageName;
    li.appendChild(label);
    const duration = document.createElement('span');
    duration.className = 'badge';
    duration.textContent = formatUsageDuration(stat.totalSeconds);
    li.appendChild(duration);
    usageListEl.appendChild(li);
  }
}

function formatUsageDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** `adb bugreport` -- полный диагностический архив устройства. Может
 * занимать несколько минут (см. AdbService.bugreport), поэтому отдельный
 * bugreportStatusEl, а не общий statusEl -- тот перезаписывается на каждом
 * тике поллинга (POLL_INTERVAL_MS выше) и стёр бы прогресс почти сразу. */
async function runBugreport(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial) return;
  runningBugreportSerial = serial;
  bugreportBtn.disabled = true;
  bugreportCancelBtn.disabled = false;
  bugreportStatusEl.textContent = 'Собираю bugreport… (может занять несколько минут)';
  try {
    const savedPath = await adbApi.bugreport(serial);
    bugreportStatusEl.textContent = savedPath ? `Сохранён: ${savedPath}` : '';
  } catch (error) {
    bugreportStatusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  } finally {
    runningBugreportSerial = undefined;
    bugreportBtn.disabled = false;
    bugreportCancelBtn.disabled = true;
  }
}

async function exportCsv(): Promise<void> {
  const serial = getCurrentSerial();
  if (!serial) return;
  let csv = 'timestamp,cpu_percent,mem_used_percent,mem_used_kb,mem_total_kb,battery_level,battery_temperature_c,charging\n';
  for (const point of statsHistory) {
    const memPercent = point.memTotalKB > 0 ? (point.memUsedKB / point.memTotalKB) * 100 : '';
    csv += `${new Date(point.timestamp).toISOString()},${point.cpuPercent ?? ''},${memPercent},${point.memUsedKB},${point.memTotalKB},${point.batteryLevel ?? ''},${point.batteryTemperature ?? ''},${point.isCharging}\n`;
  }
  try {
    const saved = await adbApi.saveCsv(`adbshell-stats-${serial}.csv`, csv);
    if (saved) statusEl.textContent = 'Экспортировано';
  } catch (error) {
    statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
  }
}

function renderStats(stats: DeviceStats): void {
  cpuValueEl.textContent = stats.cpuPercent !== undefined ? `${stats.cpuPercent.toFixed(0)}%` : '—';
  const memPercent = stats.memTotalKB > 0 ? (stats.memUsedKB / stats.memTotalKB) * 100 : undefined;
  memValueEl.textContent =
    memPercent !== undefined ? `${memPercent.toFixed(0)}% (${(stats.memUsedKB / 1024).toFixed(0)} / ${(stats.memTotalKB / 1024).toFixed(0)} MB)` : '—';
  const batteryParts: string[] = [];
  if (stats.batteryLevel !== undefined) batteryParts.push(`${stats.batteryLevel}%`);
  if (stats.batteryTemperature !== undefined) batteryParts.push(`${stats.batteryTemperature.toFixed(1)}°C`);
  if (stats.isCharging) batteryParts.push('⚡ заряжается');
  batteryValueEl.textContent = batteryParts.length > 0 ? batteryParts.join(' · ') : '—';

  cpuHistory.push(stats.cpuPercent ?? 0);
  if (cpuHistory.length > HISTORY_LENGTH) cpuHistory.shift();
  updateSparkline();
}

function updateSparkline(): void {
  if (!sparklineEl) return;
  const width = 280;
  const height = 60;
  if (cpuHistory.length < 2) {
    sparklineEl.setAttribute('points', '');
    return;
  }
  const step = width / (HISTORY_LENGTH - 1);
  const offset = HISTORY_LENGTH - cpuHistory.length;
  const points = cpuHistory
    .map((value, index) => {
      const x = (offset + index) * step;
      const y = height - (Math.min(Math.max(value, 0), 100) / 100) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  sparklineEl.setAttribute('points', points);
}

function renderProcesses(processes: RunningProcess[], serial: string): void {
  const sorted = [...processes].sort((a, b) => (b.rssKB ?? 0) - (a.rssKB ?? 0)).slice(0, 50);
  processListEl.innerHTML = '';
  for (const proc of sorted) {
    const li = document.createElement('li');
    li.className = 'row';
    const rssLabel = proc.rssKB !== undefined ? `${(proc.rssKB / 1024).toFixed(1)} MB` : '—';
    const label = document.createElement('span');
    label.textContent = `${proc.pid} · ${proc.user} · ${rssLabel} · ${proc.name}`;
    li.appendChild(label);
    const killBtn = document.createElement('button');
    killBtn.textContent = 'Kill';
    killBtn.addEventListener('click', () => {
      adbApi.killProcess(serial, proc.pid).catch((error) => {
        statusEl.textContent = `Ошибка: ${errorMessage(error)}`;
      });
    });
    li.appendChild(killBtn);
    processListEl.appendChild(li);
  }
}
