import SwiftUI
import WebKit

struct TerminalView: UIViewRepresentable {
  let sessionId: String
  @Environment(AppState.self) private var appState

  func makeUIView(context: Context) -> WKWebView {
    let config = WKWebViewConfiguration()
    let controller = WKUserContentController()
    controller.add(context.coordinator, name: "bridge")
    config.userContentController = controller

    let webView = WKWebView(frame: .zero, configuration: config)
    webView.isOpaque = false
    webView.backgroundColor = UIColor(Color.bgPrimary)
    webView.scrollView.backgroundColor = UIColor(Color.bgPrimary)
    webView.scrollView.bounces = false
    webView.scrollView.showsHorizontalScrollIndicator = false
    webView.scrollView.showsVerticalScrollIndicator = false
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.scrollView.minimumZoomScale = 1.0
    webView.scrollView.maximumZoomScale = 1.0
    webView.allowsLinkPreview = false
    webView.navigationDelegate = context.coordinator

    // Load terminal HTML from app bundle
    if let url = Bundle.main.url(forResource: "terminal", withExtension: "html") {
      webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }

    context.coordinator.appState = appState
    appState.terminalManager.webView = webView
    return webView
  }

  func updateUIView(_ webView: WKWebView, context: Context) {
    // Managed by TerminalManager
  }

  func makeCoordinator() -> Coordinator {
    Coordinator()
  }

  static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
    webView.configuration.userContentController.removeScriptMessageHandler(forName: "bridge")
  }

  class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    var appState: AppState?

    // MARK: - WKScriptMessageHandler

    func userContentController(
      _ userContentController: WKUserContentController,
      didReceive message: WKScriptMessage
    ) {
      guard let body = message.body as? [String: Any],
            let type = body["type"] as? String else { return }

      if type == "ready" {
        appState?.terminalManager.onTerminalReady()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
          guard let appState = self?.appState,
                let agent = appState.activeAgent else { return }
          appState.terminalManager.fitTerminal { cols, rows in
            appState.wsClient?.sendPtyResize(
              sessionId: agent.sessionId, cols: cols, rows: rows
            )
          }
        }
      }
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      // Page loaded — xterm.js should initialize synchronously from local bundle.
      // The JS will call notifyBridge('ready') which triggers onTerminalReady().
    }

    func webView(
      _ webView: WKWebView,
      didFail navigation: WKNavigation!,
      withError error: Error
    ) {
      print("[TerminalView] Navigation failed: \(error.localizedDescription)")
    }

    func webView(
      _ webView: WKWebView,
      didFailProvisionalNavigation navigation: WKNavigation!,
      withError error: Error
    ) {
      print("[TerminalView] Provisional navigation failed: \(error.localizedDescription)")
    }
  }
}
