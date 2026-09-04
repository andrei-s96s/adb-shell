// Порт бизнес-логики ApkTagStore из Sources/AdbShell/Services/ApkTagStore.swift
// — чистые функции над словарём "путь к файлу -> теги".

export type TagsByPath = Record<string, string[]>;

export function addTag(tagsByPath: TagsByPath, filePath: string, tag: string): TagsByPath {
  const trimmed = tag.trim();
  if (trimmed.length === 0) return tagsByPath;
  const existing = tagsByPath[filePath] ?? [];
  if (existing.includes(trimmed)) return tagsByPath;
  return { ...tagsByPath, [filePath]: [...existing, trimmed] };
}

/** Пустой список тегов после удаления полностью убирает ключ пути из
 * словаря, а не оставляет пустой массив -- держит персистентный JSON
 * компактным (тот же выбор, что и в оригинале). */
export function removeTag(tagsByPath: TagsByPath, filePath: string, tag: string): TagsByPath {
  const remaining = (tagsByPath[filePath] ?? []).filter((t) => t !== tag);
  const next = { ...tagsByPath };
  if (remaining.length === 0) {
    delete next[filePath];
  } else {
    next[filePath] = remaining;
  }
  return next;
}

export function allTags(tagsByPath: TagsByPath): string[] {
  const set = new Set<string>();
  for (const tags of Object.values(tagsByPath)) {
    for (const tag of tags) set.add(tag);
  }
  return [...set].sort();
}
