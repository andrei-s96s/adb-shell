// Порт Sources/AdbShell/Services/ProcessListParser.swift — разбор вывода
// `ps -A -o PID,PPID,USER,RSS,NAME` (toybox `ps` на Android 6+). Первая
// строка — заголовок колонок, пропускается по нечисловому PID.

import { RunningProcess } from '../types/RunningProcess';

export function parseProcessList(output: string): RunningProcess[] {
  const result: RunningProcess[] = [];
  for (const rawLine of output.split('\n')) {
    const fields = rawLine.split(' ').filter(Boolean);
    if (fields.length < 5) continue;
    const pid = Number.parseInt(fields[0], 10);
    if (Number.isNaN(pid)) continue;
    const ppidNum = Number.parseInt(fields[1], 10);
    const rssNum = Number.parseInt(fields[3], 10);
    result.push({
      pid,
      ppid: Number.isNaN(ppidNum) ? undefined : ppidNum,
      user: fields[2],
      rssKB: Number.isNaN(rssNum) ? undefined : rssNum,
      name: fields.slice(4).join(' '),
    });
  }
  return result;
}
