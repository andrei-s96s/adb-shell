// Порт ScreenMirrorService.launchGrid(_:adbPath:) из
// Sources/AdbShell/Services/ScreenMirrorService.swift -- чистая раскладка
// N окон плиткой по видимой области экрана, без обращения к реальному
// дисплею (тот подставляется вызывающей стороной).

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeGridLayout(count: number, screen: Rect): Rect[] {
  if (count <= 0) return [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const tileWidth = Math.floor(screen.width / cols);
  const tileHeight = Math.floor(screen.height / rows);

  const rects: Rect[] = [];
  for (let index = 0; index < count; index++) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    rects.push({
      x: screen.x + col * tileWidth,
      y: screen.y + row * tileHeight,
      width: tileWidth,
      height: tileHeight,
    });
  }
  return rects;
}
