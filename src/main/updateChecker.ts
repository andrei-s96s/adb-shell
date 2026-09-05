// Проверка новых версий через GitHub Releases. НЕ electron-updater/
// Squirrel.Mac -- те рассчитаны на настоящую подпись+нотаризацию Developer
// ID (сборка здесь подписана только ad-hoc, см. afterSign.js), без них
// тихая подмена .app/.exe "на лету" ненадёжна и сама может обернуться новым
// "не открывается". Вместо этого -- более скромный средний вариант (см.
// main/updateInstaller.ts): приложение само скачивает нужный под
// платформу файл релиза и на Windows сразу запускает установщик, на macOS/
// Linux -- готовит и показывает его в Finder/файловом менеджере, но
// финальный шаг (запуск инсталлятора, подтверждение Gatekeeper/SmartScreen,
// перетаскивание .app в Applications) остаётся за пользователем.
//
// До версии 1.0.0 в этом репозитории жили две независимые линейки тегов
// (macOS-версия на Swift — "v*.*.*", этот Electron-порт — "desktop-v*.*.*"),
// отсюда и был список /releases с ручным фильтром по префиксу вместо
// /releases/latest. После переноса всего функционала на Electron и удаления
// Swift-кода линейка тегов снова одна ("v*.*.*"), но /releases/latest всё
// равно не используется — раньше него могут появиться архивные Swift-теги
// той же формы, если кто-то когда-нибудь опубликует релиз задним числом;
// явный проход по /releases и sort по версии надёжнее.

export interface GitHubReleaseAssetRaw {
  name: string;
  browser_download_url: string;
}

export interface GitHubReleaseRaw {
  tag_name: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GitHubReleaseAssetRaw[];
}

export interface ReleaseAsset {
  name: string;
  url: string;
}

export interface UpdateInfo {
  version: string;
  releaseUrl: string;
  assets: ReleaseAsset[];
}

const TAG_PREFIX = 'v';

/** Чистая функция — из уже полученного списка релизов находит самый новый
 * (по версии, не по дате публикации) не-черновой и не-pre-release тег. */
export function findLatestRelease(releases: GitHubReleaseRaw[]): UpdateInfo | undefined {
  let best: UpdateInfo | undefined;
  for (const r of releases) {
    if (r.draft || r.prerelease || !r.tag_name.startsWith(TAG_PREFIX)) continue;
    const version = r.tag_name.slice(TAG_PREFIX.length);
    if (!best || compareVersions(version, best.version) > 0) {
      best = { version, releaseUrl: r.html_url, assets: (r.assets ?? []).map((a) => ({ name: a.name, url: a.browser_download_url })) };
    }
  }
  return best;
}

/** Название файла-ассета под текущую платформу, для скачивания и установки
 * прямо из приложения (см. main/updateInstaller.ts) -- одна ветка на
 * платформу, симметрично тому, как release.yml публикует по одному файлу
 * на ОС (.exe/-mac.zip/.AppImage). undefined, если релиз почему-то не
 * содержит подходящего ассета (например, ещё собирается на CI). */
export function pickAssetForPlatform(assets: ReleaseAsset[], platform: NodeJS.Platform): ReleaseAsset | undefined {
  const suffix = platform === 'win32' ? '.exe' : platform === 'darwin' ? '.zip' : platform === 'linux' ? '.AppImage' : undefined;
  if (!suffix) return undefined;
  return assets.find((a) => a.name.endsWith(suffix));
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
