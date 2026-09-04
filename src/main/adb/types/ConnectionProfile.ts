// Порт ConnectionProfile из Sources/AdbShell/Services/ConnectionProfileStore.swift

export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  autoConnect: boolean;
}
