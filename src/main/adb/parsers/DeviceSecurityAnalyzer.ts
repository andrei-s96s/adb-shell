// Порт Sources/AdbShell/Services/DeviceSecurityAnalyzer.swift — превращает
// сырые системные свойства (DeviceSecurityInfo) в список находок с уровнем
// серьёзности, используется карточкой "Безопасность" во вкладке "Мониторинг".

import { DeviceSecurityInfo, SecurityFinding } from '../types/DeviceSecurityInfo';

export function analyzeSecurity(info: DeviceSecurityInfo): SecurityFinding[] {
  const result: SecurityFinding[] = [];

  switch (info.verifiedBootState) {
    case 'green':
      result.push({ level: 'ok', messageKey: 'security.verifiedBoot.green' });
      break;
    case 'orange':
      result.push({ level: 'warning', messageKey: 'security.verifiedBoot.orange' });
      break;
    case 'yellow':
      result.push({ level: 'warning', messageKey: 'security.verifiedBoot.yellow' });
      break;
    case 'red':
      result.push({ level: 'critical', messageKey: 'security.verifiedBoot.red' });
      break;
    default:
      break;
  }

  if (info.bootloaderLocked !== undefined) {
    result.push(
      info.bootloaderLocked
        ? { level: 'ok', messageKey: 'security.bootloader.locked' }
        : { level: 'warning', messageKey: 'security.bootloader.unlocked' }
    );
  }

  if (info.suBinaryPresent) {
    result.push({ level: 'critical', messageKey: 'security.su.present' });
  }

  if (info.isDebuggable) {
    result.push({ level: 'warning', messageKey: 'security.debuggable' });
  }

  if (!info.isSecure) {
    result.push({ level: 'critical', messageKey: 'security.insecure' });
  }

  if (info.playProtectConsent === '-1') {
    result.push({ level: 'warning', messageKey: 'security.playProtect.disabled' });
  }

  if (result.length === 0) {
    result.push({ level: 'ok', messageKey: 'security.allClear' });
  }

  return result;
}
