// Порт MacroRunner.run(...) из Sources/AdbShell/Services/MacroRunner.swift —
// выполняет шаги макроса по очереди, вызывая onStep после каждого. Общий
// движок: используется и запуском из вкладки "Макросы" (main.ts,
// macros:run), и автозапуском по подключению устройства
// (renderer.ts triggerAutorunMacros -> macros:run с variables: {}).
//
// onStep -- опциональный колбэк "шаг только что завершился" (main.ts
// транслирует его в renderer push-событием 'macros:stepResult', тем же
// приёмом, что и logcat:line) -- сам runMacro() ничего не знает про IPC,
// только зовёт onStep синхронно после каждого шага, как и другие
// onProgress-колбэки в проекте (AppBundleService.exportBundle и т.п.).

import { AdbService } from '../adb/AdbService';
import { combinedOutput } from '../adb/types/ProcessResult';
import { Macro, MacroRunResult, MAX_MACRO_STEP_DELAY_MS } from '../adb/types/Macro';
import { resolveVariables } from './macroRunnerLogic';
import { tokenizeArgs } from '../adb/parsers/ShellQuoting';

export interface MacroRunOutcome {
  completedFully: boolean;
  results: MacroRunResult[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runMacro(
  macro: Macro,
  serial: string,
  service: AdbService,
  variables: Record<string, string>,
  onStep?: (index: number, total: number, result: MacroRunResult) => void
): Promise<MacroRunOutcome> {
  const results: MacroRunResult[] = [];
  const total = macro.steps.length;
  // Результат ближайшего ПРЕДЫДУЩЕГО обычного (не-задержки) шага -- на него
  // смотрит runIf следующего обычного шага. Задержки его не трогают (см.
  // ветку isDelay ниже -- пропущенный обычный шаг сбрасывает его в
  // undefined (см. комментарий у Macro.runIf: условие смотрит только на
  // шаг непосредственно перед собой, не ищет вглубь истории).
  let lastCommandOutcome: 'success' | 'failure' | undefined;

  for (let index = 0; index < macro.steps.length; index++) {
    const step = macro.steps[index];

    if (step.isDelay) {
      const delayMs = Math.min(Math.max(0, step.delayMs ?? 0), MAX_MACRO_STEP_DELAY_MS);
      await sleep(delayMs);
      const stepResult: MacroRunResult = { argsLine: '', output: `Задержка ${delayMs} мс`, isError: false };
      results.push(stepResult);
      onStep?.(index, total, stepResult);
      continue; // задержка прозрачна для lastCommandOutcome -- намеренно не трогаем его здесь
    }

    const resolvedLine = resolveVariables(step.argsLine, variables);

    const conditionMet =
      step.runIf === 'onPreviousSuccess'
        ? lastCommandOutcome === 'success'
        : step.runIf === 'onPreviousFailure'
          ? lastCommandOutcome === 'failure'
          : true;
    if (!conditionMet) {
      const stepResult: MacroRunResult = { argsLine: resolvedLine, output: '', isError: false, skipped: true };
      results.push(stepResult);
      onStep?.(index, total, stepResult);
      lastCommandOutcome = undefined; // пропуск -- тоже "неизвестный" исход для следующего условного шага
      continue;
    }

    const tokens = tokenizeArgs(resolvedLine);
    if (tokens.length === 0) continue;
    try {
      const result = await service.run(tokens, { serial });
      const isError = result.exitCode !== 0;
      const stepResult: MacroRunResult = { argsLine: resolvedLine, output: combinedOutput(result), isError };
      results.push(stepResult);
      onStep?.(index, total, stepResult);
      lastCommandOutcome = isError ? 'failure' : 'success';
      if (isError && macro.abortOnFirstFailure) return { completedFully: false, results };
    } catch (error) {
      const stepResult: MacroRunResult = { argsLine: resolvedLine, output: (error as Error).message, isError: true };
      results.push(stepResult);
      onStep?.(index, total, stepResult);
      lastCommandOutcome = 'failure';
      if (macro.abortOnFirstFailure) return { completedFully: false, results };
    }
  }
  return { completedFully: true, results };
}
