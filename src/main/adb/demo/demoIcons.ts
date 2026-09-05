// Иконки для демо-приложений -- настоящих .apk у демо-устройства нет (см.
// DemoAdbService.ts), поэтому AppIconService.fetch() для него бессмысленен
// (pull кладёт файл-заглушку, aapt2 закономерно не может прочитать её как
// APK). Вместо пустого плейсхолдера -- сгенерированный цветной кружок с
// первой буквой названия, тот же приём, что используют контакты Google/
// аватары Slack без загруженного фото: не претендует на настоящую иконку
// приложения (и потому не рискует напомнить чей-то реальный логотип),
// но выглядит как осознанный дизайн, а не "не смогли загрузить".

/** Детерминированный оттенок из имени пакета -- один и тот же цвет у
 * одного и того же демо-приложения между обновлениями списка. */
function hueFor(packageName: string): number {
  let h = 0;
  for (let i = 0; i < packageName.length; i++) h = (h * 31 + packageName.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function demoIconDataUri(label: string, packageName: string): string {
  const letter = (label.trim()[0] ?? packageName[0] ?? '?').toUpperCase();
  const hue = hueFor(packageName);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">` +
    `<rect width="32" height="32" rx="7" fill="hsl(${hue},48%,42%)"/>` +
    `<text x="16" y="22" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="16" font-weight="600" fill="#fff" text-anchor="middle">${letter}</text>` +
    `</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
