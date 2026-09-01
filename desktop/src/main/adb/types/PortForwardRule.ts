// Порт Sources/AdbShell/Models/PortForwardRule.swift

export type ForwardDirection = 'forward' | 'reverse';

export interface PortForwardRule {
  direction: ForwardDirection;
  /** Порт/сокет на Mac/Windows (host). */
  hostSpec: string;
  /** Порт/сокет на устройстве. */
  deviceSpec: string;
}
