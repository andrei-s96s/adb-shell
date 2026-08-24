import Testing
@testable import AdbShell

struct DeviceSecurityAnalyzerTests {

    @Test func cleanDeviceHasOnlyOkFindings() {
        let info = DeviceSecurityInfo(
            verifiedBootState: "green",
            bootloaderLocked: true,
            isDebuggable: false,
            isSecure: true,
            suBinaryPresent: false,
            playProtectConsent: "1"
        )
        let findings = DeviceSecurityAnalyzer.findings(for: info)
        #expect(findings.allSatisfy { $0.level == .ok })
        #expect(findings.contains { $0.messageKey == "security.verifiedBoot.green" })
        #expect(findings.contains { $0.messageKey == "security.bootloader.locked" })
    }

    @Test func rootedUnlockedDeviceFlagsCritical() {
        let info = DeviceSecurityInfo(
            verifiedBootState: "orange",
            bootloaderLocked: false,
            isDebuggable: true,
            isSecure: true,
            suBinaryPresent: true,
            playProtectConsent: "-1"
        )
        let findings = DeviceSecurityAnalyzer.findings(for: info)
        #expect(findings.contains { $0.messageKey == "security.su.present" && $0.level == .critical })
        #expect(findings.contains { $0.messageKey == "security.bootloader.unlocked" && $0.level == .warning })
        #expect(findings.contains { $0.messageKey == "security.playProtect.disabled" })
    }

    @Test func insecureBuildIsCritical() {
        let info = DeviceSecurityInfo(
            verifiedBootState: nil,
            bootloaderLocked: nil,
            isDebuggable: false,
            isSecure: false,
            suBinaryPresent: false,
            playProtectConsent: nil
        )
        let findings = DeviceSecurityAnalyzer.findings(for: info)
        #expect(findings.contains { $0.messageKey == "security.insecure" && $0.level == .critical })
    }

    @Test func unknownPropertiesProduceAllClear() {
        let info = DeviceSecurityInfo(
            verifiedBootState: nil,
            bootloaderLocked: nil,
            isDebuggable: false,
            isSecure: true,
            suBinaryPresent: false,
            playProtectConsent: nil
        )
        let findings = DeviceSecurityAnalyzer.findings(for: info)
        #expect(findings.map(\.messageKey) == ["security.allClear"])
    }
}
