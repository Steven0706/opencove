import SwiftUI
import UserNotifications

@main
struct OpenCoveApp: App {
  @State private var appState = AppState()

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environment(appState)
        .preferredColorScheme(.dark)
        .onAppear { requestNotificationPermission() }
    }
  }

  private func requestNotificationPermission() {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
  }
}

struct ContentView: View {
  @Environment(AppState.self) private var appState

  var body: some View {
    Group {
      if appState.isConnected {
        MainView()
      } else {
        ConnectView()
      }
    }
    .animation(.easeInOut(duration: 0.3), value: appState.isConnected)
  }
}
