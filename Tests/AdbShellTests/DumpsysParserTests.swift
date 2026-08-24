import Testing
@testable import AdbShell

struct DumpsysParserTests {

    @Test func parsesVersionAndSdkInfo() {
        let output = """
        Packages:
          Package [com.example.app] (abcdef):
            userId=10123
            codePath=/data/app/~~xyz==/com.example.app-abc==
            versionCode=42 minSdk=21 targetSdk=33
            versionName=1.2.3
            firstInstallTime=2024-01-10 10:00:00
            lastUpdateTime=2024-05-01 12:33:04
        """

        let detail = DumpsysParser.parseAppDetail(packageName: "com.example.app", output: output)

        #expect(detail.versionName == "1.2.3")
        #expect(detail.versionCode == "42")
        #expect(detail.targetSdk == "33")
        #expect(detail.apkPath == "/data/app/~~xyz==/com.example.app-abc==")
        #expect(detail.firstInstallTime == "2024-01-10 10:00:00")
        #expect(detail.lastUpdateTime == "2024-05-01 12:33:04")
        #expect(detail.uid == 10123)
        #expect(detail.isEnabled, "по умолчанию, если строка enabled= не встретилась, считаем включённым")
    }

    @Test func enabledFalseWhenComponentDisabled() {
        let output = """
        Package [com.example.app] (abcdef):
          enabled=false
        """
        let detail = DumpsysParser.parseAppDetail(packageName: "com.example.app", output: output)
        #expect(!detail.isEnabled)
    }

    @Test func enabledFalseForDisabledUserState() {
        let output = """
        Package [com.example.app] (abcdef):
          enabled=COMPONENT_ENABLED_STATE_DISABLED_USER
        """
        let detail = DumpsysParser.parseAppDetail(packageName: "com.example.app", output: output)
        #expect(!detail.isEnabled)
    }

    /// Runtime-разрешение должно быть togglable (isRuntime=true), а install-time
    /// (например INTERNET, живущее только в "install permissions:") — нет,
    /// иначе UI предложит "Забрать" для permission, на котором pm revoke падает.
    @Test func runtimeVsInstallPermissionsAreDistinguished() {
        let output = """
        Package [com.example.app] (abcdef):
          requested permissions:
            android.permission.INTERNET
            android.permission.CAMERA
            android.permission.ACCESS_FINE_LOCATION
          install permissions:
            android.permission.INTERNET: granted=true
          User 0:
            runtime permissions:
              android.permission.CAMERA: granted=true, flags=[ USER_SENSITIVE_WHEN_GRANTED]
              android.permission.ACCESS_FINE_LOCATION: granted=false, flags=[ USER_SENSITIVE_WHEN_GRANTED]
        """

        let detail = DumpsysParser.parseAppDetail(packageName: "com.example.app", output: output)
        let byName = Dictionary(uniqueKeysWithValues: detail.permissions.map { ($0.name, $0) })

        #expect(detail.permissions.count == 3)

        let internetPerm = byName["android.permission.INTERNET"]
        #expect(internetPerm?.isRuntime == false, "INTERNET — install-time, не должен быть togglable")
        #expect(internetPerm?.granted == true)

        let cameraPerm = byName["android.permission.CAMERA"]
        #expect(cameraPerm?.isRuntime == true)
        #expect(cameraPerm?.granted == true)

        let locationPerm = byName["android.permission.ACCESS_FINE_LOCATION"]
        #expect(locationPerm?.isRuntime == true)
        #expect(locationPerm?.granted == false)
    }

    @Test func requestedOnlyPermissionDefaultsToGrantedNonRuntime() {
        let output = """
        Package [com.example.app] (abcdef):
          requested permissions:
            android.permission.VIBRATE
        """
        let detail = DumpsysParser.parseAppDetail(packageName: "com.example.app", output: output)
        #expect(detail.permissions.count == 1)
        #expect(detail.permissions.first?.granted == true)
        #expect(detail.permissions.first?.isRuntime == false)
    }

    @Test func shortNameStripsPackagePrefix() {
        let perm = AppPermission(name: "android.permission.CAMERA", granted: true, isRuntime: true)
        #expect(perm.shortName == "CAMERA")
    }

    @Test func emptyOutputProducesNoPermissions() {
        let detail = DumpsysParser.parseAppDetail(packageName: "com.example.app", output: "")
        #expect(detail.permissions.isEmpty)
        #expect(detail.versionName == nil)
    }
}
