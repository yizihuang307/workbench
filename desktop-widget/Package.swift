// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "TodayWidget",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "TodayWidget",
            path: "Sources/TodayWidget"
        ),
    ]
)
