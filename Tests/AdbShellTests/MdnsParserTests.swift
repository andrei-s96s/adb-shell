import Testing
@testable import AdbShell

struct MdnsParserTests {

    @Test func parsesConnectAndPairingServices() {
        let output = """
        List of discovered mdns services
        adb-1234ABCD-connect\t_adb-tls-connect._tcp.\t192.168.1.50:41231
        adb-1234ABCD-pairing\t_adb-tls-pairing._tcp.\t192.168.1.50:37251
        """
        let devices = MdnsParser.parse(output)

        #expect(devices.count == 2)
        #expect(devices[0].address == "192.168.1.50:41231")
        #expect(devices[0].needsPairing == false)
        #expect(devices[1].needsPairing == true)
    }

    @Test func emptyListProducesNoDevices() {
        let output = "List of discovered mdns services\n"
        #expect(MdnsParser.parse(output).isEmpty)
    }

    @Test func malformedLinesAreSkipped() {
        let output = """
        List of discovered mdns services
        garbage line with no tabs
        name\tonly-two-fields
        """
        #expect(MdnsParser.parse(output).isEmpty)
    }

    @Test func deviceIsIdentifiedByAddress() {
        let device = MdnsDevice(name: "adb-x", type: "_adb-tls-connect._tcp.", address: "10.0.0.5:5555")
        #expect(device.id == "10.0.0.5:5555")
    }
}
