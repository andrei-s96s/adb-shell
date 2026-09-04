// Порт бизнес-логики MacroRunner из Sources/AdbShell/Services/MacroRunner.swift
// — извлечение имён переменных и подстановка значений. Чистые функции;
// собственно выполнение шагов (обращается к AdbService) — в MacroRunner.ts.

import { Macro } from '../adb/types/Macro';

const VARIABLE_RE = /\$\{([A-Za-z0-9_]+)\}/g;

/** Имена переменных, встречающихся в шагах макроса, в порядке первого
 * появления, без повторов. */
export function variableNames(macro: Macro): string[] {
  const seen: string[] = [];
  for (const step of macro.steps) {
    for (const match of step.argsLine.matchAll(VARIABLE_RE)) {
      const name = match[1];
      if (!seen.includes(name)) seen.push(name);
    }
  }
  return seen;
}

/** Подставляет значения переменных в строку аргументов. Переменная без
 * значения в словаре остаётся как есть (${NAME}) — так ошибка видна в
 * выводе команды, а не проглатывается молча. */
export function resolveVariables(argsLine: string, variables: Record<string, string>): string {
  let result = argsLine;
  for (const [name, value] of Object.entries(variables)) {
    result = result.split(`\${${name}}`).join(value);
  }
  return result;
}
