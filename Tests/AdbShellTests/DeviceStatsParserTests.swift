import Testing
@testable import AdbShell

struct DeviceStatsParserTests {

    @Test func parsesCpuTotalFromCpuinfo() {
        let output = """
        Load: 3.5 / 3.2 / 2.9
        CPU usage from 10000ms to 5000ms ago:
          9.9% 1234/system_server: 5% user + 4.8% kernel
          400% TOTAL: 30% user + 20% kernel + 0.1% iowait
        """
        #expect(DeviceStatsParser.parseCpuPercent(output) == 400)
    }

    @Test func cpuPercentIsClampedTo100() {
        let output = "150% TOTAL: 100% user + 50% kernel"
        #expect(DeviceStatsParser.parseCpuPercent(output) == 100)
    }

    @Test func cpuPercentNilWhenNoTotalLine() {
        #expect(DeviceStatsParser.parseCpuPercent("no useful data here") == nil)
    }

    @Test func parsesMemInfoUsingAvailable() {
        let output = """
        MemTotal:        3699016 kB
        MemFree:          123456 kB
        MemAvailable:    1699016 kB
        """
        let mem = DeviceStatsParser.parseMemInfo(output)
        #expect(mem?.totalKB == 3699016)
        #expect(mem?.usedKB == 3699016 - 1699016)
    }

    @Test func parsesMemInfoFallsBackToFreeWithoutAvailable() {
        let output = """
        MemTotal:        1000000 kB
        MemFree:           400000 kB
        """
        let mem = DeviceStatsParser.parseMemInfo(output)
        #expect(mem?.usedKB == 600000)
    }

    @Test func parsesBatteryChargingViaStatus() {
        let output = """
        Current Battery Service state:
          AC powered: false
          USB powered: false
          status: 2
          level: 85
          scale: 100
          temperature: 285
        """
        let battery = DeviceStatsParser.parseBattery(output)
        #expect(battery.level == 85)
        #expect(battery.temperature == 28.5)
        #expect(battery.charging)
    }

    @Test func parsesBatteryChargingViaUsbPowered() {
        let output = """
        AC powered: false
        USB powered: true
        status: 3
        level: 60
        scale: 100
        """
        let battery = DeviceStatsParser.parseBattery(output)
        #expect(battery.charging)
        #expect(battery.level == 60)
    }

    @Test func batteryLevelRescaledWhenScaleIsNot100() {
        let output = """
        level: 5
        scale: 10
        status: 4
        """
        let battery = DeviceStatsParser.parseBattery(output)
        #expect(battery.level == 50)
        #expect(!battery.charging)
    }

    @Test func combinedParseProducesMemUsedPercent() {
        let stats = DeviceStatsParser.parse(
            cpuOutput: "20% TOTAL: 10% user + 10% kernel",
            memOutput: "MemTotal: 1000 kB\nMemAvailable: 500 kB",
            batteryOutput: "level: 42\nscale: 100\nstatus: 1"
        )
        #expect(stats.cpuPercent == 20)
        #expect(stats.memUsedPercent == 50)
        #expect(stats.batteryLevel == 42)
        #expect(!stats.isCharging)
    }
}
