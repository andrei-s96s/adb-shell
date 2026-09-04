// Порт parseIconPath(fromBadging:) из Sources/AdbShell/Services/IconService.swift
// — путь к иконке внутри APK из вывода `aapt2 dump badging`: строки вида
// `application-icon-320:'res/mipmap-xhdpi-v4/ic_launcher.png'` — берётся
// путь с максимальной плотностью; если таких строк нет — фолбэк на
// `icon='...'` из строки `application: label='...' icon='...'`.

export function parseIconPath(output: string): string | undefined {
  let best: { density: number; path: string } | undefined;
  let fallback: string | undefined;

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('application-icon-')) {
      const afterPrefix = line.slice('application-icon-'.length);
      const colonIdx = afterPrefix.indexOf(':');
      if (colonIdx === -1) continue;
      const density = Number.parseInt(afterPrefix.slice(0, colonIdx), 10);
      if (Number.isNaN(density)) continue;
      const path = quotedValue(afterPrefix.slice(colonIdx + 1));
      if (path === undefined) continue;
      if (!best || density > best.density) best = { density, path };
    } else if (line.startsWith('application:')) {
      const marker = "icon='";
      const start = line.indexOf(marker);
      if (start === -1) continue;
      const rest = line.slice(start + marker.length);
      const end = rest.indexOf("'");
      if (end !== -1) fallback = rest.slice(0, end);
    }
  }
  return best?.path ?? fallback;
}

function quotedValue(text: string): string | undefined {
  const firstQuote = text.indexOf("'");
  if (firstQuote === -1) return undefined;
  const rest = text.slice(firstQuote + 1);
  const secondQuote = rest.indexOf("'");
  if (secondQuote === -1) return undefined;
  return rest.slice(0, secondQuote);
}
