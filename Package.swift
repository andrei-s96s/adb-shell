// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AdbShell",
    defaultLocalization: "ru",
    platforms: [
        .macOS(.v13)
    ],
    targets: [
        .executableTarget(
            name: "AdbShell",
            path: "Sources/AdbShell",
            resources: [
                .process("Localization/ru.lproj"),
                .process("Localization/en.lproj")
            ],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .testTarget(
            name: "AdbShellTests",
            dependencies: ["AdbShell"],
            path: "Tests/AdbShellTests",
            swiftSettings: [.swiftLanguageMode(.v5)]
        )
    ]
)
