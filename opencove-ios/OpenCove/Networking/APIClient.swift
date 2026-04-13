import Foundation

enum APIError: LocalizedError {
  case invalidResponse
  case serverError(String)
  case networkError(Error)

  var errorDescription: String? {
    switch self {
    case .invalidResponse: "Invalid response from server"
    case .serverError(let msg): msg
    case .networkError(let err): err.localizedDescription
    }
  }
}

final class APIClient {
  let config: ConnectionConfig
  private let session: URLSession

  init(config: ConnectionConfig) {
    self.config = config
    let sessionConfig = URLSessionConfiguration.default
    sessionConfig.timeoutIntervalForRequest = 15
    self.session = URLSession(configuration: sessionConfig)
  }

  func healthCheck() async throws {
    var request = URLRequest(url: config.healthURL)
    if !config.token.isEmpty {
      request.setValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
    }
    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
      if let http = response as? HTTPURLResponse, http.statusCode == 401 {
        throw APIError.serverError("Invalid token")
      }
      throw APIError.serverError("Server unreachable (HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0))")
    }
    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       json["status"] as? String != "ok" {
      throw APIError.serverError("Not an OpenCove server")
    }
  }

  func invoke(channel: String, payload: [String: Any] = [:]) async throws -> Any {
    var request = URLRequest(url: config.invokeURL)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if !config.token.isEmpty {
      request.setValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
    }

    let body: [String: Any] = ["channel": channel, "payload": payload]
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, response) = try await session.data(for: request)

    guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
      let code = (response as? HTTPURLResponse)?.statusCode ?? 0
      throw APIError.serverError("HTTP \(code)")
    }

    guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw APIError.invalidResponse
    }

    guard json["ok"] as? Bool == true else {
      let errorMsg = (json["error"] as? [String: Any])?["debugMessage"] as? String
        ?? json["error"] as? String
        ?? "Unknown server error"
      throw APIError.serverError(errorMsg)
    }

    return json["value"] as Any
  }

  /// Result from fetching workspace nodes — includes scrollback map for history
  struct WorkspaceNodesResult {
    let agents: [AgentNode]
    let scrollbackByNodeId: [String: String]
  }

  /// Fetches active agent/terminal nodes by merging two APIs:
  /// - `web-server:get-live-nodes` → runtime sessionId + status
  /// - `persistence:read-workspace-state-raw` → title, kind, agent provider, scrollback
  func fetchWorkspaceNodes() async throws -> WorkspaceNodesResult {
    // 1. Get live node mapping (sessionId, status)
    let liveResult = try await invoke(channel: "web-server:get-live-nodes")
    let liveNodes: [[String: Any]]
    if let str = liveResult as? String,
       let parsed = try? JSONSerialization.jsonObject(
         with: Data(str.utf8)) as? [[String: Any]] {
      liveNodes = parsed
    } else if let arr = liveResult as? [[String: Any]] {
      liveNodes = arr
    } else {
      liveNodes = []
    }

    // 2. Get persistence data (title, agent info, scrollback)
    let persistResult = try await invoke(channel: "persistence:read-workspace-state-raw")
    let persistNodes: [[String: Any]]
    if let str = persistResult as? String,
       let parsed = try? JSONSerialization.jsonObject(with: Data(str.utf8)) as? [String: Any],
       let workspaces = parsed["workspaces"] as? [[String: Any]],
       let ws = workspaces.first,
       let nodes = ws["nodes"] as? [[String: Any]] {
      persistNodes = nodes
    } else if let dict = persistResult as? [String: Any],
              let workspaces = dict["workspaces"] as? [[String: Any]],
              let ws = workspaces.first,
              let nodes = ws["nodes"] as? [[String: Any]] {
      persistNodes = nodes
    } else {
      persistNodes = []
    }

    // 3. Build persistence lookup by id
    var persistMap: [String: [String: Any]] = [:]
    for node in persistNodes {
      if let id = node["id"] as? String {
        persistMap[id] = node
      }
    }

    // 4. Merge and build scrollback map
    var scrollbackMap: [String: String] = [:]
    let agents: [AgentNode] = liveNodes.compactMap { live in
      guard let id = live["id"] as? String,
            let sessionId = live["sessionId"] as? String,
            !sessionId.isEmpty,
            let kindStr = live["kind"] as? String,
            (kindStr == "agent" || kindStr == "terminal")
      else { return nil }

      let persist = persistMap[id] ?? [:]
      let statusStr = live["status"] as? String ?? ""
      let title = persist["title"] as? String ?? "Untitled"
      let agent = persist["agent"] as? [String: Any]
      let provider = agent?["provider"] as? String
        ?? (kindStr == "terminal" ? "terminal" : "unknown")

      // Extract persisted scrollback for this node
      if let scrollback = persist["scrollback"] as? String, !scrollback.isEmpty {
        scrollbackMap[id] = scrollback
      }

      return AgentNode(
        id: id,
        sessionId: sessionId,
        title: title,
        kind: NodeKind(rawValue: kindStr) ?? .terminal,
        status: AgentStatus(rawValue: statusStr) ?? .unknown,
        provider: provider
      )
    }

    return WorkspaceNodesResult(agents: agents, scrollbackByNodeId: scrollbackMap)
  }

  /// PTY snapshot returns `{ data: "<ansi string>" }`
  func fetchSnapshot(sessionId: String) async throws -> String? {
    let result = try await invoke(channel: "pty:snapshot", payload: ["sessionId": sessionId])
    if let dict = result as? [String: Any] {
      return dict["data"] as? String
    }
    if let str = result as? String { return str }
    return nil
  }

  func transcribe(audioData: Data) async throws -> String {
    let base64 = audioData.base64EncodedString()
    let result = try await invoke(channel: "whisper:transcribe", payload: [
      "audioBase64": base64,
      "filename": "recording.wav",
    ])
    guard let dict = result as? [String: Any],
          let text = dict["text"] as? String,
          dict["success"] as? Bool == true
    else {
      throw APIError.serverError("Transcription failed")
    }
    return text
  }
}
