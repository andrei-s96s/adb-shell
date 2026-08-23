import Testing
@testable import AdbShell

struct ADBServiceParsingTests {

    @Test func parseDevicesUsbAndNetwork() {
        let output = """
        List of devices attached
        R58N30ABCDE            device usb:1-1 product:voyah_car model:Voyah_HU device:hu transport_id:1
        192.168.1.50:5555      device product:generic model:Generic_x86 device:generic transport_id:2
        emulator-5554          offline transport_id:3

        """

        let devices = ADBService.parseDevices(from: output)

        #expect(devices.count == 3)

        let usb = devices[0]
        #expect(usb.serial == "R58N30ABCDE")
        #expect(usb.state == .device)
        #expect(usb.model == "Voyah_HU")
        #expect(!usb.isNetwork)

        let network = devices[1]
        #expect(network.serial == "192.168.1.50:5555")
        #expect(network.isNetwork)
        #expect(network.model == "Generic_x86")

        let offline = devices[2]
        #expect(offline.state == .offline)
        #expect(offline.model == nil)
    }

    @Test func parseDevicesUnauthorized() {
        let output = """
        List of devices attached
        R58N30ABCDE            unauthorized usb:1-1 transport_id:1
        """
        let devices = ADBService.parseDevices(from: output)
        #expect(devices.first?.state == .unauthorized)
        #expect(!(devices.first?.state.isReady ?? true))
    }

    @Test func parseDevicesEmptyList() {
        let output = "List of devices attached\n"
        #expect(ADBService.parseDevices(from: output).isEmpty)
    }

    @Test func mergeAppsFlagsSystemAndDisabled() {
        let all = """
        package:com.android.settings
        package:com.example.userapp
        package:com.example.disabledapp
        """
        let user = """
        package:com.example.userapp
        package:com.example.disabledapp
        """
        let disabled = """
        package:com.example.disabledapp
        """

        let apps = ADBService.mergeApps(all: all, user: user, disabled: disabled)
        let byName = Dictionary(uniqueKeysWithValues: apps.map { ($0.packageName, $0) })

        #expect(apps.count == 3)

        #expect(byName["com.android.settings"]?.isSystem == true)
        #expect(byName["com.android.settings"]?.isEnabled == true)

        #expect(byName["com.example.userapp"]?.isSystem == false)
        #expect(byName["com.example.userapp"]?.isEnabled == true)

        #expect(byName["com.example.disabledapp"]?.isSystem == false)
        #expect(byName["com.example.disabledapp"]?.isEnabled == false)
    }

    @Test func mergeAppsSortedCaseInsensitive() {
        let all = """
        package:com.Zebra.app
        package:com.alpha.app
        """
        let apps = ADBService.mergeApps(all: all, user: "", disabled: "")
        #expect(apps.map(\.packageName) == ["com.alpha.app", "com.Zebra.app"])
    }

    @Test func mergeAppsEmptyInput() {
        #expect(ADBService.mergeApps(all: "", user: "", disabled: "").isEmpty)
    }
}
