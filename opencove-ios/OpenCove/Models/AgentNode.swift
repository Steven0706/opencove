import SwiftUI

enum NodeKind: String {
  case agent
  case terminal
  case task
  case note
  case image
  case pgViewer
}

enum AgentStatus: String {
  case running
  case standby
  case exited
  case failed
  case stopped
  case restoring
  case unknown

  var color: Color {
    switch self {
    case .running: .green
    case .standby: .yellow
    case .exited: .gray
    case .failed: .red
    case .stopped: .orange
    case .restoring: .blue
    case .unknown: .gray.opacity(0.5)
    }
  }

  var label: String {
    switch self {
    case .running: "Running"
    case .standby: "Ready"
    case .exited: "Exited"
    case .failed: "Failed"
    case .stopped: "Stopped"
    case .restoring: "Restoring"
    case .unknown: "Unknown"
    }
  }
}

struct AgentNode: Identifiable {
  let id: String
  let sessionId: String
  let title: String
  let kind: NodeKind
  var status: AgentStatus
  let provider: String

  var displayTitle: String {
    if title.isEmpty {
      return provider == "terminal" ? "Terminal" : provider.capitalized
    }
    return title
  }

  var providerIcon: String {
    switch provider {
    case "claude-code": "brain.head.profile"
    case "codex": "cpu"
    case "opencode": "terminal"
    case "gemini": "sparkles"
    default: "terminal"
    }
  }

  static func parse(from json: [String: Any]) -> AgentNode? {
    guard let id = json["id"] as? String,
          let data = json["data"] as? [String: Any],
          let kindStr = data["kind"] as? String,
          let kind = NodeKind(rawValue: kindStr),
          kind == .agent || kind == .terminal,
          let sessionId = data["sessionId"] as? String,
          !sessionId.isEmpty
    else { return nil }

    let title = data["title"] as? String ?? ""
    let statusStr = data["status"] as? String ?? ""
    let status = AgentStatus(rawValue: statusStr) ?? .unknown
    let agentData = data["agent"] as? [String: Any]
    let provider = agentData?["provider"] as? String ?? (kind == .terminal ? "terminal" : "unknown")

    return AgentNode(
      id: id,
      sessionId: sessionId,
      title: title,
      kind: kind,
      status: status,
      provider: provider
    )
  }
}
