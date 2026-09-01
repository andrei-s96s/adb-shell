import { adbApi, el, errorMessage } from '../api.js';
import type { DeviceStats, RunningProcess } from '../api.js';
import { onDeviceChanged, getCurrentSerial } from '../state.js';

const POLL_INTERVAL_MS = 2000;
const HISTORY_LENGTH = 30;

let statusEl: HTMLDivElement;
let cpuValueEl: HTMLDivElement;
let memValueEl: HTMLDivElement;
let batteryValueEl: HTMLDivElement;
let sparklineEl: SVGPolylineElement;
let processListEl: HTMLUListElement;

let pollTimer: ReturnType<typeof setInterval> | undefined;
let cpuHistory: number[] = [];

export function initMonitorScreen(): void {
  statusEl = el<HTMLDivElement>('monitor-status');
  cpuValueEl = el<HTMLDivElement>('monitor-cpu');
  memValueEl = el<HTMLDivElement>('monitor-mem');
  batteryValueEl = el<HTMLDivElement>('monitor-battery');
  sparklineEl = document.getElementById('monitor-sparkline-points') as unknown as SVGPolylineElement;
  processListEl = el<HTMLUListElement>('monitor-process-list');

  onDeviceChanged((serial) => {
    stopPolling();
    cpuHistory = [];
    updateSparkline();
    cpuValueEl.textContent = '—';
    memValueEl.textContent = '—';
    batteryValueEl.textContent = '—';
    processListEl.innerHTML = '';
    if (serial) startPolling(serial);
  });
}

function startPolling(serial: string): void {
  void poll(serial);
  pollTimer = setInterval(() => void poll(serial), POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
}

async function poll(serial: string): Promise<void> {
  // Устройство могло смениться, пока летел предыдущий запрос — не затираем
  // данные другого устройства результатом, пришедшим слишком поздно.
  try {
    const [stats, processes] = await Promise.all([adbApi.deviceStats(serial), adbApi.runningProcesses(serial)]);
    if (getCurrentSerial() !== serial) return;
    renderStats(stats);
    renderProcesses(processes, serial);
    statusEl.textContent = '';
  } catch (error) {
    if (getCurrentSerial() !== serial) return;
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
    li.innerHTML = `<span>${proc.pid} · ${proc.user} · ${rssLabel} · ${proc.name}</span>`;
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
