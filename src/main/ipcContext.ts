// Общее состояние, которое читают/пишут IPC-хендлеры, разложенные по
// доменным registerXxxIpc(ctx)-функциям рядом с соответствующими сервисами
// (main.ts раньше регистрировал все 124 канала в одной функции). Объект
// один на процесс, создаётся в main.ts и передаётся каждой из них.
//
// ctx.adb -- ЕДИНСТВЕННОЕ поле, которое переприсваивается на лету (demoMode:set
// в main.ts переключает его между realAdb/demoAdb): все хендлеры читают
// ctx.adb в момент вызова, а не один раз при регистрации, поэтому
// переключение демо-режима мгновенно меняет поведение уже
// зарегистрированных хендлеров без их пересоздания -- то же свойство, что
// было у модульного `let adb` в main.ts до разбиения.

import { AdbService } from './adb/AdbService';
import { ApkLibraryService } from './apkLibrary/ApkLibraryService';
import { ApkTagStore } from './apkLibrary/ApkTagStore';
import { IntentPresetStore } from './intentPresets/IntentPresetStore';
import { MacroStore } from './macros/MacroStore';
import { AppIconService } from './appIcons/AppIconService';
import { ShellHistoryStore } from './shellHistory/ShellHistoryStore';
import { DeviceSnapshotService } from './deviceSnapshots/DeviceSnapshotService';
import { ScreenMirrorService } from './screenMirror/ScreenMirrorService';
import { ConnectionProfileStore } from './connectionProfiles/ConnectionProfileStore';
import { DeviceNicknameStore } from './deviceNicknames/DeviceNicknameStore';
import { DevicePinStore } from './devicePins/DevicePinStore';
import { DeviceTagStore } from './deviceTags/DeviceTagStore';
import { AppSettingsStore } from './settings/AppSettingsStore';
import { LogcatSession } from './adb/LogcatSession';
import { DemoLogcatSession } from './adb/demo/DemoLogcatSession';

export interface IpcContext {
  /** Переключаемый demoMode:set в main.ts -- см. комментарий выше. */
  adb: AdbService;
  /** Namespace realAdb, а не переключаемый adb -- нужен только
   * adb:restartServer (лечит НАСТОЯЩИЙ adb-сервер независимо от того,
   * включён ли сейчас демо-режим в UI). */
  readonly realAdb: AdbService;
  readonly apkLibrary: ApkLibraryService;
  readonly apkTags: ApkTagStore;
  readonly intentPresets: IntentPresetStore;
  readonly macroStore: MacroStore;
  readonly appIcons: AppIconService;
  readonly shellHistory: ShellHistoryStore;
  readonly deviceSnapshots: DeviceSnapshotService;
  readonly screenMirror: ScreenMirrorService;
  readonly connectionProfiles: ConnectionProfileStore;
  readonly deviceNicknames: DeviceNicknameStore;
  readonly devicePins: DevicePinStore;
  readonly deviceTags: DeviceTagStore;
  readonly appSettings: AppSettingsStore;
  readonly logcatSessions: Map<string, LogcatSession | DemoLogcatSession>;
  /** Определена в main.ts (нужны HOTKEY_ACCELERATOR/captureScreenshotToDesktop,
   * которые остаются там же) -- settings:update (settings/registerIpc.ts)
   * вызывает её при изменении globalScreenshotHotkeyEnabled. */
  readonly applyHotkeySetting: () => void;
  /** Тоже определена в main.ts (нужны globalShortcut/hotkeySelectedSerial) --
   * macros:add/update/remove/import (macros/registerIpc.ts) вызывают её,
   * когда набор аккселераторов макросов мог измениться. */
  readonly applyMacroHotkeys: () => void;
  /** Снимок того, какие аккселераторы макросов реально зарегистрированы
   * прямо сейчас -- см. macros:activeHotkeys. */
  readonly activeMacroHotkeyAccelerators: () => string[];
}
