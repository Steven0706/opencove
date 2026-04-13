import Foundation

final class WebSocketClient: NSObject, URLSessionWebSocketDelegate {
  let config: ConnectionConfig
  private var task: URLSessionWebSocketTask?
  private var urlSession: URLSession?
  private var isConnected = false
  private var reconnectDelay: TimeInterval = 0.5
  private var clientId: String?

  var onPtyData: ((String, String) -> Void)?
  var onPtyState: ((String, String) -> Void)?
  var onPtyExit: ((String, Int) -> Void)?
  var onConnected: (() -> Void)?
  var onDisconnected: (() -> Void)?

  init(config: ConnectionConfig) {
    self.config = config
    super.init()
  }

  func connect() {
    guard let url = URL(string: config.wsURL) else { return }
    let session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
    urlSession = session
    task = session.webSocketTask(with: url)
    task?.resume()
    receiveMessage()
  }

  func disconnect() {
    isConnected = false
    task?.cancel(with: .goingAway, reason: nil)
    task = nil
    urlSession?.invalidateAndCancel()
    urlSession = nil
  }

  // MARK: - Send

  func sendPtyWrite(sessionId: String, data: String) {
    send([
      "type": "pty-write",
      "sessionId": sessionId,
      "data": data,
      "encoding": "utf8",
    ])
  }

  func sendPtyResize(sessionId: String, cols: Int, rows: Int) {
    send([
      "type": "pty-resize",
      "sessionId": sessionId,
      "cols": cols,
      "rows": rows,
    ])
  }

  func sendRequest(channel: String, payload: [String: Any]) {
    send([
      "type": "request",
      "id": UUID().uuidString,
      "channel": channel,
      "payload": payload,
    ])
  }

  // MARK: - Private

  private func send(_ dict: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: dict),
          let text = String(data: data, encoding: .utf8) else { return }
    task?.send(.string(text)) { error in
      if let error { print("[WS] Send error: \(error)") }
    }
  }

  private func receiveMessage() {
    task?.receive { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(let message):
        switch message {
        case .string(let text):
          self.handleMessage(text)
        case .data(let data):
          if let text = String(data: data, encoding: .utf8) {
            self.handleMessage(text)
          }
        @unknown default:
          break
        }
        self.receiveMessage()
      case .failure(let error):
        print("[WS] Receive error: \(error)")
        self.handleDisconnect()
      }
    }
  }

  private func handleMessage(_ text: String) {
    guard let data = text.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let type = json["type"] as? String else { return }

    switch type {
    case "hello":
      clientId = json["clientId"] as? String
      isConnected = true
      reconnectDelay = 0.5
      DispatchQueue.main.async { self.onConnected?() }

    case "event":
      handleEvent(json)

    case "ping":
      let ts = json["ts"] as? Double ?? 0
      send(["type": "pong", "ts": ts])

    case "response":
      // Fire-and-forget — responses are not awaited
      break

    default:
      break
    }
  }

  private func handleEvent(_ json: [String: Any]) {
    guard let channel = json["channel"] as? String,
          let payload = json["payload"] as? [String: Any] else { return }

    switch channel {
    case "pty:data":
      if let sessionId = payload["sessionId"] as? String,
         let data = payload["data"] as? String {
        DispatchQueue.main.async { self.onPtyData?(sessionId, data) }
      }

    case "pty:state":
      if let sessionId = payload["sessionId"] as? String,
         let state = payload["state"] as? String {
        DispatchQueue.main.async { self.onPtyState?(sessionId, state) }
      }

    case "pty:exit":
      if let sessionId = payload["sessionId"] as? String,
         let exitCode = payload["exitCode"] as? Int {
        DispatchQueue.main.async { self.onPtyExit?(sessionId, exitCode) }
      }

    default:
      break
    }
  }

  private func handleDisconnect() {
    guard isConnected else { return }
    isConnected = false
    DispatchQueue.main.async { self.onDisconnected?() }

    // Exponential backoff reconnect
    DispatchQueue.global().asyncAfter(deadline: .now() + reconnectDelay) { [weak self] in
      guard let self else { return }
      self.reconnectDelay = min(self.reconnectDelay * 1.5, 15)
      self.connect()
    }
  }

  // MARK: - URLSessionWebSocketDelegate

  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didOpenWithProtocol protocol: String?
  ) {
    print("[WS] Connected")
  }

  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
    reason: Data?
  ) {
    print("[WS] Closed: \(closeCode)")
    handleDisconnect()
  }
}
