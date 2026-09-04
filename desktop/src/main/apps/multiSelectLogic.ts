// Порт AppsViewModel.handleRowClick(_:modifiers:) из
// Sources/AdbShell/ViewModels/AppsViewModel.swift — мультивыбор в духе
// Finder: обычный клик выбирает одну строку, ⌘-клик добавляет/убирает,
// ⇧-клик выделяет диапазон от последнего "обычного" клика (anchor).
//
// Живёт в main/ (а не в renderer/, где реально используется) исключительно
// ради тестируемости node:test — renderer.ts-файлы не входят в тестируемый
// tsconfig-проект. apps.ts дублирует эту логику напрямую (тот же принцип,
// что и для остальной renderer-логики, см. комментарий в renderer/api.ts).

export interface SelectionState {
  selected: Set<string>;
  lastClicked?: string;
}

export interface ClickModifiers {
  meta: boolean;
  shift: boolean;
}

export function emptySelection(): SelectionState {
  return { selected: new Set(), lastClicked: undefined };
}

export function handleRowClick(
  state: SelectionState,
  packageName: string,
  orderedVisible: string[],
  modifiers: ClickModifiers
): SelectionState {
  if (modifiers.meta) {
    const selected = new Set(state.selected);
    if (selected.has(packageName)) {
      selected.delete(packageName);
    } else {
      selected.add(packageName);
    }
    return { selected, lastClicked: packageName };
  }

  if (modifiers.shift && state.lastClicked !== undefined) {
    const anchorIdx = orderedVisible.indexOf(state.lastClicked);
    const clickedIdx = orderedVisible.indexOf(packageName);
    if (anchorIdx !== -1 && clickedIdx !== -1) {
      const from = Math.min(anchorIdx, clickedIdx);
      const to = Math.max(anchorIdx, clickedIdx);
      const selected = new Set(state.selected);
      for (let i = from; i <= to; i++) selected.add(orderedVisible[i]);
      // lastClicked остаётся прежним anchor'ом (не переприсваивается) --
      // цепочка ⇧-кликов всегда тянется от исходной "обычной" точки клика,
      // как в Finder/Explorer, а не от последнего ⇧-клика.
      return { selected, lastClicked: state.lastClicked };
    }
    return { selected: new Set([packageName]), lastClicked: packageName };
  }

  return { selected: new Set([packageName]), lastClicked: packageName };
}
