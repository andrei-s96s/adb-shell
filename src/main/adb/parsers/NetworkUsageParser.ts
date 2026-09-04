// Порт Sources/AdbShell/Services/NetworkUsageParser.swift — разбор
// `dumpsys netstats detail`. Недокументированный формат, слегка отличается
// между версиями Android (поля rxBytes=/rb=, txBytes=/tb=), поэтому парсер
// намеренно толерантен: ищет блоки "uid=<uid> ..." и суммирует все
// встретившиеся в блоке байты вплоть до следующего "uid=".

const UID_RE = /uid=(\d+)/;
const RX_RE = /\b(?:rxBytes|rb)=(\d+)/;
const TX_RE = /\b(?:txBytes|tb)=(\d+)/;

export interface NetworkUsage {
  rxBytes: number;
  txBytes: number;
}

export function parseNetworkUsage(output: string, uid: number): NetworkUsage {
  let currentUid: number | undefined;
  let rx = 0;
  let tx = 0;

  for (const line of output.split('\n')) {
    const uidMatch = line.match(UID_RE);
    if (uidMatch) currentUid = Number(uidMatch[1]);
    if (currentUid !== uid) continue;

    const rxMatch = line.match(RX_RE);
    if (rxMatch) rx += Number(rxMatch[1]);
    const txMatch = line.match(TX_RE);
    if (txMatch) tx += Number(txMatch[1]);
  }

  return { rxBytes: rx, txBytes: tx };
}
