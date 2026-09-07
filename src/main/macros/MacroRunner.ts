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
import { Macro, MacroRunResult } from '../adb/types/Macro';
import { resolveVariables } from './macroRunnerLogic';
import { tokenizeArgs } from '../adb/parsers/ShellQuoting';

export interface MacroRunOutcome {
  completedFully: boolean;
  results: MacroRunResult[];
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
  for (let index = 0; index < macro.steps.length; index++) {
    const step = macro.steps[index];
    const resolvedLine = resolveVariables(step.argsLine, variables);
    const tokens = tokenizeArgs(resolvedLine);
    if (tokens.length === 0) continue;
    try {
      const result = await service.run(tokens, { serial });
      const isError = result.exitCode !== 0;
      const stepResult: MacroRunResult = { argsLine: resolvedLine, output: combinedOutput(result), isError };
      results.push(stepResult);
      onStep?.(index, total, stepResult);
      if (isError && macro.abortOnFirstFailure) return { completedFully: false, results };
    } catch (error) {
      const stepResult: MacroRunResult = { argsLine: resolvedLine, output: (error as Error).message, isError: true };
      results.push(stepResult);
      onStep?.(index, total, stepResult);
      if (macro.abortOnFirstFailure) return { completedFully: false, results };
    }
  }
  return { completedFully: true, results };
}
