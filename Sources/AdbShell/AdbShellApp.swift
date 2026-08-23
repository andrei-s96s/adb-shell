import SwiftUI

@main
struct AdbShellApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark)
                .frame(minWidth: 1080, minHeight: 680)
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)
        .defaultSize(width: 1240, height: 760)
        .commands {
            CommandGroup(replacing: .newItem) { }
        }
    }
}
