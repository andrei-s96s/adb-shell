// Статические данные демо-устройства -- один правдоподобный набор
// приложений/файлов/свойств, вокруг которого DemoAdbService (соседний файл)
// строит поведение. Чисто данные, без логики форматирования (см.
// demoFormatters.ts) и без побочных эффектов -- поэтому легко читать и
// незачем тестировать отдельно.

export const DEMO_SERIAL = 'demo-device';
export const DEMO_MODEL = 'Pixel_8_Pro';
export const DEMO_PRODUCT = 'husky';
export const DEMO_IP = '192.168.1.42';

export interface DemoAppProfile {
  packageName: string;
  label: string;
  isSystem: boolean;
  /** Отключено пользователем (появляется в `pm list packages -d`) --
   * начальное состояние, дальше меняется через enable/disable-user в самой
   * сессии (см. DemoAdbService). */
  disabledByDefault: boolean;
  versionName: string;
  versionCode: number;
  targetSdk: number;
  firstInstallTime: string;
  lastUpdateTime: string;
  uid: number;
  requestedPermissions: string[];
  /** granted -- Android перечисляет разрешение в "runtime permissions:",
   * только если оно вообще запрошено в манифесте; здесь -- то же самое
   * подмножество requestedPermissions, помеченное как runtime-переключаемое. */
  runtimePermissions: Record<string, boolean>;
  installPermissions: Record<string, boolean>;
}

const NETWORK_ONLY = {
  requestedPermissions: ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE'],
  runtimePermissions: {},
  installPermissions: {
    'android.permission.INTERNET': true,
    'android.permission.ACCESS_NETWORK_STATE': true,
  },
};

/** 18 пакетов -- достаточно, чтобы список не выглядел игрушечным, но не
 * настолько много, чтобы каждый требовал индивидуального описания:
 * "интересным" (богатый набор разрешений, реалистичные версии) описаны
 * только те, с которыми правдоподобно захочется повзаимодействовать в
 * демо (Spotify, Instagram, WhatsApp, Telegram, Chrome, Termux), остальные
 * получают общий сетевой профиль NETWORK_ONLY. */
export const DEMO_APPS: DemoAppProfile[] = [
  {
    packageName: 'com.android.chrome',
    label: 'Chrome',
    isSystem: true,
    disabledByDefault: false,
    versionName: '128.0.6613.126',
    versionCode: 661312610,
    targetSdk: 34,
    firstInstallTime: '2023-11-02 09:14:03',
    lastUpdateTime: '2025-08-20 03:41:17',
    uid: 10101,
    requestedPermissions: [
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.POST_NOTIFICATIONS',
    ],
    runtimePermissions: {
      'android.permission.CAMERA': true,
      'android.permission.RECORD_AUDIO': false,
      'android.permission.ACCESS_FINE_LOCATION': false,
      'android.permission.POST_NOTIFICATIONS': true,
    },
    installPermissions: { 'android.permission.INTERNET': true, 'android.permission.ACCESS_NETWORK_STATE': true },
  },
  {
    packageName: 'com.google.android.gms',
    label: 'Google Play Services',
    isSystem: true,
    disabledByDefault: false,
    versionName: '24.30.31',
    versionCode: 243031038,
    targetSdk: 34,
    firstInstallTime: '2023-11-02 09:12:40',
    lastUpdateTime: '2025-08-31 11:02:09',
    uid: 10021,
    ...NETWORK_ONLY,
  },
  {
    packageName: 'com.android.vending',
    label: 'Play Store',
    isSystem: true,
    disabledByDefault: false,
    versionName: '44.6.21-31',
    versionCode: 84462131,
    targetSdk: 34,
    firstInstallTime: '2023-11-02 09:12:41',
    lastUpdateTime: '2025-08-28 06:55:02',
    uid: 10022,
    ...NETWORK_ONLY,
  },
  {
    packageName: 'com.google.android.gm',
    label: 'Gmail',
    isSystem: true,
    disabledByDefault: false,
    versionName: '2025.08.02',
    versionCode: 20250802,
    targetSdk: 34,
    firstInstallTime: '2023-11-02 09:14:55',
    lastUpdateTime: '2025-08-25 14:20:33',
    uid: 10087,
    requestedPermissions: [
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.READ_CONTACTS',
      'android.permission.POST_NOTIFICATIONS',
    ],
    runtimePermissions: {
      'android.permission.READ_CONTACTS': true,
      'android.permission.POST_NOTIFICATIONS': true,
    },
    installPermissions: { 'android.permission.INTERNET': true, 'android.permission.ACCESS_NETWORK_STATE': true },
  },
  {
    packageName: 'com.google.android.apps.maps',
    label: 'Maps',
    isSystem: true,
    disabledByDefault: false,
    versionName: '25.34.02',
    versionCode: 253402000,
    targetSdk: 34,
    firstInstallTime: '2023-11-02 09:15:10',
    lastUpdateTime: '2025-09-01 08:44:19',
    uid: 10098,
    requestedPermissions: [
      'android.permission.INTERNET',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.CAMERA',
    ],
    runtimePermissions: {
      'android.permission.ACCESS_FINE_LOCATION': true,
      'android.permission.ACCESS_COARSE_LOCATION': true,
      'android.permission.CAMERA': false,
    },
    installPermissions: { 'android.permission.INTERNET': true },
  },
  {
    packageName: 'com.google.android.youtube',
    label: 'YouTube',
    isSystem: true,
    disabledByDefault: false,
    versionName: '19.35.36',
    versionCode: 1935360200,
    targetSdk: 34,
    firstInstallTime: '2023-11-02 09:15:40',
    lastUpdateTime: '2025-08-30 19:12:44',
    uid: 10102,
    ...NETWORK_ONLY,
  },
  {
    packageName: 'com.android.settings',
    label: 'Настройки',
    isSystem: true,
    disabledByDefault: false,
    versionName: '14',
    versionCode: 34,
    targetSdk: 34,
    firstInstallTime: '2023-11-02 09:10:00',
    lastUpdateTime: '2023-11-02 09:10:00',
    uid: 1000,
    requestedPermissions: [],
    runtimePermissions: {},
    installPermissions: {},
  },
  {
    packageName: 'com.android.systemui',
    label: 'System UI',
    isSystem: true,
    disabledByDefault: false,
    versionName: '14',
    versionCode: 34,
    targetSdk: 34,
    firstInstallTime: '2023-11-02 09:10:00',
    lastUpdateTime: '2023-11-02 09:10:00',
    uid: 10004,
    requestedPermissions: [],
    runtimePermissions: {},
    installPermissions: {},
  },
  {
    packageName: 'com.google.android.calendar',
    label: 'Календарь',
    isSystem: true,
    disabledByDefault: false,
    versionName: '2025.32.1',
    versionCode: 2025320100,
    targetSdk: 34,
    firstInstallTime: '2023-11-02 09:16:02',
    lastUpdateTime: '2025-08-11 09:00:51',
    uid: 10110,
    ...NETWORK_ONLY,
  },
  {
    packageName: 'com.google.android.dialer',
    label: 'Телефон',
    isSystem: true,
    disabledByDefault: false,
    versionName: '108.0.622356649',
    versionCode: 622356649,
    targetSdk: 34,
    firstInstallTime: '2023-11-02 09:10:20',
    lastUpdateTime: '2025-07-29 12:10:00',
    uid: 10005,
    requestedPermissions: ['android.permission.READ_CONTACTS'],
    runtimePermissions: { 'android.permission.READ_CONTACTS': true },
    installPermissions: {},
  },
  {
    packageName: 'com.facebook.services',
    label: 'Facebook App Manager',
    isSystem: true,
    disabledByDefault: true,
    versionName: '441.0.0.32.115',
    versionCode: 441032115,
    targetSdk: 33,
    firstInstallTime: '2023-11-02 09:20:00',
    lastUpdateTime: '2024-12-01 10:00:00',
    uid: 10120,
    ...NETWORK_ONLY,
  },
  {
    packageName: 'com.spotify.music',
    label: 'Spotify',
    isSystem: false,
    disabledByDefault: false,
    versionName: '8.9.98.583',
    versionCode: 88998583,
    targetSdk: 34,
    firstInstallTime: '2024-01-15 10:22:31',
    lastUpdateTime: '2025-08-27 08:11:04',
    uid: 10201,
    requestedPermissions: [
      'android.permission.INTERNET',
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.READ_EXTERNAL_STORAGE',
    ],
    runtimePermissions: {
      'android.permission.RECORD_AUDIO': true,
      'android.permission.ACCESS_FINE_LOCATION': false,
      'android.permission.POST_NOTIFICATIONS': true,
      'android.permission.READ_EXTERNAL_STORAGE': true,
    },
    installPermissions: { 'android.permission.INTERNET': true },
  },
  {
    packageName: 'com.instagram.android',
    label: 'Instagram',
    isSystem: false,
    disabledByDefault: false,
    versionName: '340.0.0.35.94',
    versionCode: 574123456,
    targetSdk: 34,
    firstInstallTime: '2024-02-03 18:40:12',
    lastUpdateTime: '2025-09-01 07:30:00',
    uid: 10202,
    requestedPermissions: [
      'android.permission.INTERNET',
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.READ_CONTACTS',
      'android.permission.POST_NOTIFICATIONS',
    ],
    runtimePermissions: {
      'android.permission.CAMERA': true,
      'android.permission.RECORD_AUDIO': true,
      'android.permission.ACCESS_FINE_LOCATION': false,
      'android.permission.READ_CONTACTS': false,
      'android.permission.POST_NOTIFICATIONS': true,
    },
    installPermissions: { 'android.permission.INTERNET': true },
  },
  {
    packageName: 'com.whatsapp',
    label: 'WhatsApp',
    isSystem: false,
    disabledByDefault: false,
    versionName: '2.25.17.78',
    versionCode: 252517078,
    targetSdk: 34,
    firstInstallTime: '2024-01-20 11:05:00',
    lastUpdateTime: '2025-08-29 21:14:09',
    uid: 10203,
    requestedPermissions: [
      'android.permission.INTERNET',
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_CONTACTS',
      'android.permission.POST_NOTIFICATIONS',
    ],
    runtimePermissions: {
      'android.permission.CAMERA': true,
      'android.permission.RECORD_AUDIO': true,
      'android.permission.READ_CONTACTS': true,
      'android.permission.POST_NOTIFICATIONS': true,
    },
    installPermissions: { 'android.permission.INTERNET': true },
  },
  {
    packageName: 'org.telegram.messenger',
    label: 'Telegram',
    isSystem: false,
    disabledByDefault: false,
    versionName: '11.4.0',
    versionCode: 4520,
    targetSdk: 34,
    firstInstallTime: '2024-03-11 16:02:44',
    lastUpdateTime: '2025-08-22 10:03:55',
    uid: 10204,
    requestedPermissions: [
      'android.permission.INTERNET',
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_CONTACTS',
      'android.permission.POST_NOTIFICATIONS',
    ],
    runtimePermissions: {
      'android.permission.CAMERA': false,
      'android.permission.RECORD_AUDIO': false,
      'android.permission.READ_CONTACTS': false,
      'android.permission.POST_NOTIFICATIONS': true,
    },
    installPermissions: { 'android.permission.INTERNET': true },
  },
  {
    packageName: 'com.discord',
    label: 'Discord',
    isSystem: false,
    disabledByDefault: false,
    versionName: '250.15 - Stable',
    versionCode: 250150,
    targetSdk: 34,
    firstInstallTime: '2024-05-06 20:11:30',
    lastUpdateTime: '2025-08-19 15:45:02',
    uid: 10205,
    ...NETWORK_ONLY,
  },
  {
    packageName: 'com.termux',
    label: 'Termux',
    isSystem: false,
    disabledByDefault: false,
    versionName: '0.118.1',
    versionCode: 118,
    targetSdk: 28,
    firstInstallTime: '2024-06-19 09:00:00',
    lastUpdateTime: '2024-11-02 09:00:00',
    uid: 10206,
    requestedPermissions: ['android.permission.INTERNET', 'android.permission.POST_NOTIFICATIONS'],
    runtimePermissions: { 'android.permission.POST_NOTIFICATIONS': true },
    installPermissions: { 'android.permission.INTERNET': true },
  },
  {
    packageName: 'com.github.android',
    label: 'GitHub',
    isSystem: false,
    disabledByDefault: false,
    versionName: '1.234.0',
    versionCode: 1234000,
    targetSdk: 34,
    firstInstallTime: '2024-07-01 12:00:00',
    lastUpdateTime: '2025-08-15 12:00:00',
    uid: 10207,
    ...NETWORK_ONLY,
  },
];

/** Плоское фейковое дерево файлов -- ключ -- абсолютный путь директории,
 * значение -- строки в формате, близком к `ls -la` (без самих полей
 * permissions/size/date -- это собирает demoFormatters.formatLsLa из
 * DemoRemoteEntry, см. там). Задаёт только НАЧАЛЬНОЕ состояние -- mkdir/rm
 * в сессии мутируют копию в DemoFileSystem, не эти константы. */
export interface DemoRemoteEntry {
  name: string;
  isDirectory: boolean;
  sizeBytes: number;
  modified: string;
}

export const DEMO_FILESYSTEM: Record<string, DemoRemoteEntry[]> = {
  '/sdcard': [
    { name: 'DCIM', isDirectory: true, sizeBytes: 4096, modified: '2025-09-01 10:22' },
    { name: 'Download', isDirectory: true, sizeBytes: 4096, modified: '2025-08-30 18:04' },
    { name: 'Pictures', isDirectory: true, sizeBytes: 4096, modified: '2025-08-29 09:15' },
    { name: 'Movies', isDirectory: true, sizeBytes: 4096, modified: '2025-08-11 20:00' },
    { name: 'Android', isDirectory: true, sizeBytes: 4096, modified: '2025-07-02 08:00' },
    { name: 'Documents', isDirectory: true, sizeBytes: 4096, modified: '2025-06-14 14:41' },
    { name: '.thumbnails', isDirectory: true, sizeBytes: 4096, modified: '2025-05-01 00:00' },
    { name: 'notes.txt', isDirectory: false, sizeBytes: 842, modified: '2025-08-27 22:10' },
  ],
  '/sdcard/DCIM': [{ name: 'Camera', isDirectory: true, sizeBytes: 4096, modified: '2025-09-01 10:22' }],
  '/sdcard/DCIM/Camera': [
    { name: 'IMG_20250820_141502.jpg', isDirectory: false, sizeBytes: 4_213_882, modified: '2025-08-20 14:15' },
    { name: 'IMG_20250825_091144.jpg', isDirectory: false, sizeBytes: 3_887_120, modified: '2025-08-25 09:11' },
    { name: 'VID_20250830_180230.mp4', isDirectory: false, sizeBytes: 58_221_004, modified: '2025-08-30 18:02' },
  ],
  '/sdcard/Download': [
    { name: 'adb-shell-1.2.0.apk', isDirectory: false, sizeBytes: 21_442_113, modified: '2025-09-01 09:40' },
    { name: 'report.pdf', isDirectory: false, sizeBytes: 512_003, modified: '2025-08-18 16:20' },
  ],
  '/sdcard/Pictures': [{ name: 'Screenshots', isDirectory: true, sizeBytes: 4096, modified: '2025-08-29 09:15' }],
  '/sdcard/Pictures/Screenshots': [
    { name: 'Screenshot_20250829_091522.png', isDirectory: false, sizeBytes: 1_882_004, modified: '2025-08-29 09:15' },
  ],
  '/sdcard/Movies': [],
  '/sdcard/Android': [{ name: 'data', isDirectory: true, sizeBytes: 4096, modified: '2025-07-02 08:00' }],
  '/sdcard/Android/data': [
    { name: 'com.spotify.music', isDirectory: true, sizeBytes: 4096, modified: '2025-08-27 08:11' },
    { name: 'com.whatsapp', isDirectory: true, sizeBytes: 4096, modified: '2025-08-29 21:14' },
  ],
  '/sdcard/Documents': [],
};

/** Полный `getprop`-дамп -- реалистичное подмножество ключей, которые
 * реально используются где-то в приложении (allProperties -- просто
 * список для вкладки "Инструменты", остальные -- securityInfo). */
export const DEMO_GETPROP: Record<string, string> = {
  'ro.product.model': DEMO_MODEL,
  'ro.product.brand': 'google',
  'ro.product.manufacturer': 'Google',
  'ro.product.name': DEMO_PRODUCT,
  'ro.product.device': DEMO_PRODUCT,
  'ro.build.version.release': '15',
  'ro.build.version.sdk': '35',
  'ro.build.id': 'AP4A.250105.007',
  'ro.build.display.id': 'AP4A.250105.007',
  'ro.build.type': 'user',
  'ro.build.tags': 'release-keys',
  'ro.serialno': DEMO_SERIAL,
  'ro.boot.verifiedbootstate': 'green',
  'ro.boot.flash.locked': '1',
  'ro.debuggable': '0',
  'ro.secure': '1',
  'ro.hardware': 'zuma',
  'persist.sys.timezone': 'Europe/Moscow',
  'net.hostname': 'pixel-8-pro-demo',
  'dalvik.vm.heapsize': '512m',
};
