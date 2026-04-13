import WebKit

final class TerminalManager {
  weak var webView: WKWebView?
  var isReady = false
  var currentSessionId: String?
  private var pendingSnapshot: String?
  private var pendingChunks: [String] = []

  func handlePtyData(sessionId: String, data: String) {
    guard sessionId == currentSessionId else { return }
    writeData(data)
  }

  func writeData(_ data: String) {
    guard let webView else { return }
    if !isReady {
      pendingChunks.append(data)
      return
    }
    let b64 = Data(data.utf8).base64EncodedString()
    DispatchQueue.main.async {
      webView.evaluateJavaScript("window.writeBase64('\(b64)')") { _, _ in }
    }
  }

  func clearAndLoadSession(sessionId: String, snapshot: String?) {
    currentSessionId = sessionId
    pendingChunks = []

    guard isReady, let webView else {
      pendingSnapshot = snapshot
      return
    }

    DispatchQueue.main.async {
      webView.evaluateJavaScript("window.clearTerminal()") { [weak self] _, _ in
        guard let self else { return }
        if let snapshot, !snapshot.isEmpty {
          let b64 = Data(snapshot.utf8).base64EncodedString()
          webView.evaluateJavaScript("window.writeBase64('\(b64)')") { _, _ in
            // Scroll to bottom after loading history
            webView.evaluateJavaScript("window.scrollToBottom()") { _, _ in }
          }
        }
      }
    }
  }

  func onTerminalReady() {
    isReady = true

    // Flush pending snapshot
    if let snapshot = pendingSnapshot {
      pendingSnapshot = nil
      if let sid = currentSessionId {
        clearAndLoadSession(sessionId: sid, snapshot: snapshot)
      }
    }

    // Flush any queued live data chunks
    if !pendingChunks.isEmpty {
      let chunks = pendingChunks
      pendingChunks = []
      let combined = chunks.joined()
      writeData(combined)
    }
  }

  func fitTerminal(completion: ((Int, Int) -> Void)? = nil) {
    guard isReady, let webView else { return }
    DispatchQueue.main.async {
      webView.evaluateJavaScript("window.fitTerminal()") { result, _ in
        if let json = result as? String,
           let data = json.data(using: .utf8),
           let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let cols = dict["cols"] as? Int,
           let rows = dict["rows"] as? Int {
          completion?(cols, rows)
        }
      }
    }
  }
}
