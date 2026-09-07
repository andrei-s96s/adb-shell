// Чистая логика тегов устройств -- по serial, тот же принцип, что и у
// apkTagsLogic.ts (ApkTagStore): словарь "ключ -> теги", а не поле на самой
// записи, потому что устройство, в отличие от макроса, не персистентная
// запись приложения -- оно просто появляется/пропадает из вывода `adb
// devices` в зависимости от того, что физически подключено, и своего места
// для метаданных у него нет.

export type TagsBySerial = Record<string, string[]>;

export function addTag(tagsBySerial: TagsBySerial, serial: string, tag: string): TagsBySerial {
  const trimmed = tag.trim();
  if (trimmed.length === 0) return tagsBySerial;
  const existing = tagsBySerial[serial] ?? [];
  if (existing.includes(trimmed)) return tagsBySerial;
  return { ...tagsBySerial, [serial]: [...existing, trimmed] };
}

/** Пустой список тегов после удаления полностью убирает ключ serial из
 * словаря, а не оставляет пустой массив -- держит персистентный JSON
 * компактным (тот же выбор, что и в ApkTagStore.removeTag). */
export function removeTag(tagsBySerial: TagsBySerial, serial: string, tag: string): TagsBySerial {
  const remaining = (tagsBySerial[serial] ?? []).filter((t) => t !== tag);
  const next = { ...tagsBySerial };
  if (remaining.length === 0) {
    delete next[serial];
  } else {
    next[serial] = remaining;
  }
  return next;
}

export function allTags(tagsBySerial: TagsBySerial): string[] {
  const set = new Set<string>();
  for (const tags of Object.values(tagsBySerial)) {
    for (const tag of tags) set.add(tag);
  }
  return [...set].sort();
}
