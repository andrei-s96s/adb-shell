// Разбор `aapt2 dump resources <apk>` — находит растровую (PNG/WEBP)
// иконку-замену, когда путь из parseIconPath() (см. IconPathParser.ts)
// указывает на adaptive icon (XML, например
// `res/mipmap-anydpi-v26/ic_launcher.xml`) вместо картинки. Большинство
// современных приложений (targetSdk 26+) как раз так и устроены — простой
// отказ "иконка это XML, значит иконки нет" (как было раньше) оставляет
// плейсхолдер почти у всех реальных APK, не только у редких случаев.
//
// Формат `dump resources` -- список блоков вида:
//   resource 0x7f100002 mipmap/launcher_icon
//     () @mipmap/icon
//     (anydpi) (file) res/mipmap-anydpi-v26/launcher_icon.xml type=XML
// Внутри одного блока qualifier'ы (mdpi/hdpi/xhdpi/.../anydpi) — варианты
// ОДНОГО ресурса на разные плотности/версии API; "()" без qualifier — это
// либо файл по умолчанию, либо, как в примере выше, ССЫЛКА на другой
// ресурс (`@mipmap/icon`) — так Android-сборка делает, когда картинка для
// pre-API26 живёт под другим именем ресурса, а `mipmap/launcher_icon`
// нужен только затем, чтобы добавить пары adaptive-icon (anydpi) вариант.
//
// Стратегия: 1) внутри блока, которому принадлежит путь из parseIconPath,
// поискать растровый (не XML) файл на любой плотности; 2) если не нашли,
// но у блока есть ссылка по умолчанию ("()" без плотности) на другой
// ресурс — заглянуть в НЕГО (один прыжок, по всем реальным APK,
// на которых это проверялось, достаточно одного). Оба сценария —
// подтверждённые реальные случаи (см. AdaptiveIconResolver.test.ts).

export interface ResolvedIconFile {
  /** Путь внутри APK (для AdmZip.readFile). */
  zipEntryPath: string;
  mimeType: 'image/png' | 'image/webp';
}

interface ResourceEntry {
  qualifier: string;
  filePath?: string;
  aliasRef?: string;
}

interface ResourceBlock {
  key: string; // "mipmap/launcher_icon"
  entries: ResourceEntry[];
}

/** Плотности от самой высокой к самой низкой -- при нескольких растровых
 * вариантах в одном блоке берём самый чёткий (пригодится в списке при любом
 * масштабе экрана/HiDPI). Всё, чего нет в списке (в т.ч. "" -- вариант без
 * qualifier'а), считается ниже "mdpi" по приоритету. */
const DENSITY_PRIORITY = ['xxxhdpi', 'xxhdpi', 'xhdpi', 'hdpi', 'mdpi', 'ldpi', 'nodpi', 'anydpi'];

function densityRank(qualifier: string): number {
  const idx = DENSITY_PRIORITY.indexOf(qualifier);
  return idx === -1 ? DENSITY_PRIORITY.length : idx;
}

function mimeTypeFor(filePath: string): 'image/png' | 'image/webp' | undefined {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return undefined;
}

export function parseResourceBlocks(output: string): ResourceBlock[] {
  const blocks: ResourceBlock[] = [];
  let current: ResourceBlock | undefined;

  for (const rawLine of output.split('\n')) {
    const resourceMatch = /^\s*resource\s+0x[0-9a-fA-F]+\s+(\S+)/.exec(rawLine);
    if (resourceMatch) {
      current = { key: resourceMatch[1], entries: [] };
      blocks.push(current);
      continue;
    }
    if (!current) continue;

    const trimmed = rawLine.trim();
    const entryMatch = /^\(([^)]*)\)\s+(.*)$/.exec(trimmed);
    if (!entryMatch) continue;
    const qualifier = entryMatch[1];
    const rest = entryMatch[2];

    const fileMatch = /^\(file\)\s+(\S+)/.exec(rest);
    if (fileMatch) {
      current.entries.push({ qualifier, filePath: fileMatch[1] });
      continue;
    }
    const aliasMatch = /^@(\S+)/.exec(rest);
    if (aliasMatch) {
      current.entries.push({ qualifier, aliasRef: aliasMatch[1] });
    }
  }
  return blocks;
}

function bestRasterInBlock(block: ResourceBlock): ResolvedIconFile | undefined {
  let best: { entry: ResourceEntry; mimeType: 'image/png' | 'image/webp' } | undefined;
  for (const entry of block.entries) {
    if (!entry.filePath) continue;
    const mimeType = mimeTypeFor(entry.filePath);
    if (!mimeType) continue;
    if (!best || densityRank(entry.qualifier) < densityRank(best.entry.qualifier)) {
      best = { entry, mimeType };
    }
  }
  return best ? { zipEntryPath: best.entry.filePath!, mimeType: best.mimeType } : undefined;
}

/** iconPath -- путь из parseIconPath() (badging), обычно .xml раз мы вообще
 * здесь. Возвращает подходящую растровую замену или undefined, если её
 * найти не удалось (тогда вызывающая сторона просто оставляет плейсхолдер,
 * как и раньше). */
export function resolveAdaptiveIconFile(resourcesDump: string, iconPath: string): ResolvedIconFile | undefined {
  const blocks = parseResourceBlocks(resourcesDump);
  const owner = blocks.find((b) => b.entries.some((e) => e.filePath === iconPath));
  if (!owner) return undefined;

  const direct = bestRasterInBlock(owner);
  if (direct) return direct;

  // "()" без qualifier'а и есть ссылка (а не файл) -- ресурс со значением
  // по умолчанию через другое имя (см. комментарий в начале файла).
  const alias = owner.entries.find((e) => e.qualifier === '' && e.aliasRef)?.aliasRef;
  if (!alias) return undefined;
  const aliasBlock = blocks.find((b) => b.key === alias);
  return aliasBlock ? bestRasterInBlock(aliasBlock) : undefined;
}
