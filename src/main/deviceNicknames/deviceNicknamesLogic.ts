// Порт бизнес-логики DeviceNicknameStore из
// Sources/AdbShell/Services/DeviceNicknameStore.swift.

export type NicknameMap = Record<string, string>;

/** Пустое (после trim) имя удаляет никнейм полностью, а не сохраняет
 * пустую строку — так `nicknames[serial]` можно и дальше использовать как
 * "есть ли никнейм" без отдельной проверки на пустоту. */
export function applySetNickname(nicknames: NicknameMap, serial: string, name: string): NicknameMap {
  const trimmed = name.trim();
  const next = { ...nicknames };
  if (trimmed.length === 0) {
    delete next[serial];
  } else {
    next[serial] = trimmed;
  }
  return next;
}
