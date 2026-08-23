import Testing
import Foundation
@testable import AdbShell

@MainActor
struct ShellHistoryStoreTests {

    /// Изолированный UserDefaults suite на тест, чтобы не пачкать реальные настройки
    /// и не ловить гонки между параллельными тестами.
    private func makeStore() -> (ShellHistoryStore, UserDefaults) {
        let suiteName = "ShellHistoryStoreTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defaults.removePersistentDomain(forName: suiteName)
        return (ShellHistoryStore(defaults: defaults), defaults)
    }

    @Test func recordAddsNewCommandToRecent() {
        let (store, _) = makeStore()
        store.record("pm list packages -3")
        #expect(store.recent.map(\.text) == ["pm list packages -3"])
        #expect(store.favorites.isEmpty)
    }

    @Test func recordingSameCommandTwiceDoesNotDuplicate() {
        let (store, _) = makeStore()
        store.record("getprop ro.build.version.release")
        store.record("getprop ro.build.version.release")
        #expect(store.recent.count == 1)
    }

    @Test func favoriteMovesCommandOutOfRecentIntoFavorites() {
        let (store, _) = makeStore()
        store.record("dumpsys battery")
        guard let id = store.recent.first?.id else {
            Issue.record("expected a recent command")
            return
        }
        store.toggleFavorite(id)
        #expect(store.recent.isEmpty)
        #expect(store.favorites.map(\.text) == ["dumpsys battery"])
    }

    @Test func favoriteHelperCreatesEntryDirectly() {
        let (store, _) = makeStore()
        store.favorite("pm clear com.example.app")
        #expect(store.favorites.map(\.text) == ["pm clear com.example.app"])
        #expect(store.recent.isEmpty)
    }

    @Test func removeDeletesEntry() {
        let (store, _) = makeStore()
        store.record("cmd1")
        let id = store.recent.first!.id
        store.remove(id)
        #expect(store.recent.isEmpty)
    }

    @Test func blankCommandIsIgnored() {
        let (store, _) = makeStore()
        store.record("   ")
        #expect(store.recent.isEmpty)
        #expect(store.favorites.isEmpty)
    }
}
