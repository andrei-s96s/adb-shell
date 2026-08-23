import Testing
import Foundation
@testable import AdbShell

@MainActor
struct ConnectionProfileStoreTests {

    private func makeStore() -> ConnectionProfileStore {
        let suiteName = "ConnectionProfileStoreTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        return ConnectionProfileStore(defaults: defaults)
    }

    @Test func addCreatesProfile() {
        let store = makeStore()
        store.add(name: "Head unit", host: "192.168.1.50:5555")
        #expect(store.profiles.count == 1)
        #expect(store.profiles.first?.name == "Head unit")
        #expect(store.profiles.first?.autoConnect == false)
    }

    @Test func addWithBlankNameFallsBackToHost() {
        let store = makeStore()
        store.add(name: "  ", host: "192.168.1.50:5555")
        #expect(store.profiles.first?.name == "192.168.1.50:5555")
    }

    @Test func addingSameHostTwiceUpdatesNameInsteadOfDuplicating() {
        let store = makeStore()
        store.add(name: "First", host: "192.168.1.50:5555")
        store.add(name: "Second", host: "192.168.1.50:5555")
        #expect(store.profiles.count == 1)
        #expect(store.profiles.first?.name == "Second")
    }

    @Test func toggleAutoConnectFlipsFlag() {
        let store = makeStore()
        store.add(name: "Head unit", host: "192.168.1.50:5555")
        let id = store.profiles.first!.id
        store.toggleAutoConnect(id)
        #expect(store.profiles.first?.autoConnect == true)
        #expect(store.autoConnectProfiles.count == 1)
        store.toggleAutoConnect(id)
        #expect(store.profiles.first?.autoConnect == false)
        #expect(store.autoConnectProfiles.isEmpty)
    }

    @Test func removeDeletesProfile() {
        let store = makeStore()
        store.add(name: "Head unit", host: "192.168.1.50:5555")
        let id = store.profiles.first!.id
        store.remove(id)
        #expect(store.profiles.isEmpty)
    }

    @Test func blankHostIsIgnored() {
        let store = makeStore()
        store.add(name: "X", host: "   ")
        #expect(store.profiles.isEmpty)
    }
}
