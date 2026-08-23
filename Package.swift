// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AdbShell",
    platforms: [
        .macOS(.v13)
    ],
    targets: [
        .executableTarget(
            name: "AdbShell",
            path: "Sources/AdbShell"
        )
    ]
)
