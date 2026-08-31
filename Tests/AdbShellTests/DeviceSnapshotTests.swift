import Foundation
import Testing
@testable import AdbShell

struct DeviceSnapshotTests {

    @Test func filenameRoundTripsLabelAndAppCount() {
        let filename = DeviceSnapshot.makeFilename(deviceLabel: "Pixel 7 Pro", appCount: 42)
        let url = URL(fileURLWithPath: "/tmp/\(filename)")
        let createdAt = Date(timeIntervalSince1970: 1_700_000_000)

        let snapshot = DeviceSnapshot.parse(url: url, createdAt: createdAt)

        #expect(snapshot?.deviceLabel == "Pixel 7 Pro")
        #expect(snapshot?.appCount == 42)
        #expect(snapshot?.createdAt == createdAt)
    }

    @Test func sanitizesPunctuationAndUnicodeInDeviceLabel() {
        // Nicknames and device models can contain slashes, colons, Cyrillic, etc. —
        // the filename must stay a single flat path component and still parse back.
        let filename = DeviceSnapshot.makeFilename(deviceLabel: "Мой Voyah / SSH-туннель:9222", appCount: 5)

        #expect(!filename.contains("/"))
        #expect(!filename.contains(":"))

        let url = URL(fileURLWithPath: "/tmp/\(filename)")
        let snapshot = DeviceSnapshot.parse(url: url, createdAt: .distantPast)
        #expect(snapshot?.appCount == 5)
    }

    @Test func unrelatedZipFileDoesNotParseAsSnapshot() {
        let url = URL(fileURLWithPath: "/tmp/apps-export-2026-01-01-000000.zip")
        #expect(DeviceSnapshot.parse(url: url, createdAt: .distantPast) == nil)
    }

    @Test func twoSnapshotsOfSameDeviceGetDistinctFilenames() {
        let first = DeviceSnapshot.makeFilename(deviceLabel: "Pixel 7 Pro", appCount: 42)
        let second = DeviceSnapshot.makeFilename(deviceLabel: "Pixel 7 Pro", appCount: 42)
        #expect(first != second)
    }
}
