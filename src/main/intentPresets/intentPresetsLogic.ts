// Порт бизнес-логики IntentPresetStore из
// Sources/AdbShell/Services/IntentPresetStore.swift.

import { IntentPreset } from '../adb/types/IntentPreset';

/** Пустой (после trim) uri игнорируется целиком -- не имеет смысла
 * сохранять пресет без ссылки. */
export function addPreset(presets: IntentPreset[], name: string, uri: string, makeId: () => string): IntentPreset[] {
  const trimmedUri = uri.trim();
  if (trimmedUri.length === 0) return presets;
  const trimmedName = name.trim();
  return [...presets, { id: makeId(), name: trimmedName.length > 0 ? trimmedName : trimmedUri, uri: trimmedUri }];
}

export function removePreset(presets: IntentPreset[], id: string): IntentPreset[] {
  return presets.filter((p) => p.id !== id);
}
