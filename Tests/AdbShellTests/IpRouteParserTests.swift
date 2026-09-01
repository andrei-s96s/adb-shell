import Testing
@testable import AdbShell

struct IpRouteParserTests {

    @Test func parsesWlanSrcAddress() {
        let output = """
        192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.1.42
        """
        #expect(IpRouteParser.parseDeviceIP(from: output) == "192.168.1.42")
    }

    @Test func prefersWlanOverOtherInterfacesWhenMultipleLines() {
        let output = """
        10.0.0.0/24 dev rndis0 proto kernel scope link src 10.0.0.5
        192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.1.42
        """
        #expect(IpRouteParser.parseDeviceIP(from: output) == "192.168.1.42")
    }

    @Test func fallsBackToAnyInterfaceWithSrcWhenNoWlan() {
        let output = """
        10.0.0.0/24 dev rndis0 proto kernel scope link src 10.0.0.5
        """
        #expect(IpRouteParser.parseDeviceIP(from: output) == "10.0.0.5")
    }

    @Test func returnsNilWhenNoSrcPresent() {
        let output = "default via 192.168.1.1 dev wlan0"
        #expect(IpRouteParser.parseDeviceIP(from: output) == nil)
    }

    @Test func returnsNilForEmptyOutput() {
        #expect(IpRouteParser.parseDeviceIP(from: "") == nil)
    }
}
