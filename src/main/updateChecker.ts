// Проверка новых версий через GitHub Releases — только уведомление со
// ссылкой на страницу релиза, БЕЗ автоматического скачивания и подмены
// .app/.exe на лету. Причины: (1) на macOS сборка подписана только ad-hoc
// (см. afterSign.js) — Squirrel.Mac, на котором держится electron-updater,
// для надёжной проверки апдейтов рассчитан на настоящую подпись+нотаризацию
// Developer ID, без них автообновление ненадёжно и само может обернуться
// новым "не открывается"; (2) NSIS-обновления на Windows без сертификата
// тоже показывают предупреждение при каждой установке — то же самое, что
// видит пользователь и при обычной ручной установке новой версии.
//
// До версии 1.0.0 в этом репозитории жили две независимые линейки тегов
// (macOS-версия на Swift — "v*.*.*", этот Electron-порт — "desktop-v*.*.*"),
// отсюда и был список /releases с ручным фильтром по префиксу вместо
// /releases/latest. После переноса всего функционала на Electron и удаления
// Swift-кода линейка тегов снова одна ("v*.*.*"), но /releases/latest всё
// равно не используется — раньше него могут появиться архивные Swift-теги
// той же формы, если кто-то когда-нибудь опубликует релиз задним числом;
// явный проход по /releases и sort по версии надёжнее.

export interface GitHubReleaseRaw {
  tag_name: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
}

export interface UpdateInfo {
  version: string;
  releaseUrl: string;
}

const TAG_PREFIX = 'v';

/** Чистая функция — из уже полученного списка релизов находит самый новый
 * (по версии, не по дате публикации) не-черновой и не-pre-release тег. */
export function findLatestRelease(releases: GitHubReleaseRaw[]): { version: string; releaseUrl: string } | undefined {
  let best: { version: string; releaseUrl: string } | undefined;
  for (const r of releases) {
    if (r.draft || r.prerelease || !r.tag_name.startsWith(TAG_PREFIX)) continue;
    const version = r.tag_name.slice(TAG_PREFIX.length);
    if (!best || compareVersions(version, best.version) > 0) {
      best = { version, releaseUrl: r.html_url };
    }
  }
  return best;
}

/** Сравнение версий вида "1.2.3": >0 если a новее b, 0 если равны, <0 если
 * a старее. Нечисловые/отсутствующие компоненты считаются нулём. */
export function compareVersions(a: string, b: string): number {
  const partsOf = (v: string): number[] => v.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const partsA = partsOf(a);
  const partsB = partsOf(b);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** undefined = обновлений нет, сеть недоступна, или релизов ещё не существует
 * (не ошибка). */
export async function checkForUpdate(currentVersion: string, repo = 'andrei-s96s/adb-shell'): Promise<UpdateInfo | undefined> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=15`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return undefined;
    const releases = (await response.json()) as GitHubReleaseRaw[];
    const latest = findLatestRelease(releases);
    if (!latest || compareVersions(latest.version, currentVersion) <= 0) return undefined;
    return latest;
  } catch {
    return undefined;
  }
}
