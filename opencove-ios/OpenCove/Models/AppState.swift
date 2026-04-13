import Foundation
import Observation
import UserNotifications

@Observable
final class AppState {
  var isConnected = false
  var isConnecting = false
  var connectionError: String?
  var agents: [AgentNode] = []
  var activeAgentIndex = 0
  var isLoadingSnapshot = false

  @ObservationIgnored var connectionConfig: ConnectionConfig?
  @ObservationIgnored var apiClient: APIClient?
  @ObservationIgnored var wsClient: WebSocketClient?
  @ObservationIgnored var terminalManager = TerminalManager()
  @ObservationIgnored var scrollbackByNodeId: [String: String] = [:]
  @ObservationIgnored private var pollTimer: Timer?
  @ObservationIgnored private var lastSnapshotLength = 0

  var activeAgent: AgentNode? {
    guard !agents.isEmpty, activeAgentIndex >= 0, activeAgentIndex < agents.count else { return nil }
    return agents[activeAgentIndex]
  }

  @MainActor
  func connect(host: String, port: String, token: String) async {
    let config = ConnectionConfig(host: host, port: Int(port) ?? 3200, token: token)
    connectionConfig = config
    isConnecting = true
    connectionError = nil

    let client = APIClient(config: config)
    apiClient = client

    do {
      try await client.healthCheck()
      let result = try await client.fetchWorkspaceNodes()
      agents = result.agents
      scrollbackByNodeId = result.scrollbackByNodeId

      if agents.isEmpty {
        connectionError = "No active agents or terminals found in workspace"
        isConnecting = false
        return
      }

      let ws = WebSocketClient(config: config)
      ws.onPtyData = { [weak self] sessionId, data in
        self?.terminalManager.handlePtyData(sessionId: sessionId, data: data)
      }
      ws.onPtyState = { [weak self] sessionId, state in
        Task { @MainActor in
          self?.handleAgentStateChange(sessionId: sessionId, state: state)
        }
      }
      ws.onPtyExit = { [weak self] sessionId, exitCode in
        Task { @MainActor in
          self?.handleAgentExit(sessionId: sessionId, exitCode: exitCode)
        }
      }
      wsClient = ws
      ws.connect()

      for agent in agents {
        ws.sendRequest(channel: "pty:attach", payload: ["sessionId": agent.sessionId])
      }

      isConnected = true
      isConnecting = false

      await activateAgent(at: 0)
    } catch {
      connectionError = error.localizedDescription
      isConnecting = false
    }
  }

  @MainActor
  func switchToAgent(at index: Int) async {
    guard index >= 0, index < agents.count, index != activeAgentIndex else { return }
    await activateAgent(at: index)
  }

  @MainActor
  func switchToNextAgent() async {
    let next = (activeAgentIndex + 1) % max(agents.count, 1)
    await switchToAgent(at: next)
  }

  @MainActor
  func switchToPreviousAgent() async {
    let prev = activeAgentIndex > 0 ? activeAgentIndex - 1 : max(agents.count - 1, 0)
    await switchToAgent(at: prev)
  }

  @MainActor
  private func activateAgent(at index: Int) async {
    activeAgentIndex = index
    isLoadingSnapshot = true
    stopPolling()

    guard let agent = activeAgent else {
      isLoadingSnapshot = false
      return
    }

    // Try live snapshot first, fall back to persisted scrollback
    var content: String?
    content = try? await apiClient?.fetchSnapshot(sessionId: agent.sessionId)
    if content == nil || content?.isEmpty == true {
      content = scrollbackByNodeId[agent.id]
    }

    lastSnapshotLength = content?.count ?? 0
    terminalManager.clearAndLoadSession(sessionId: agent.sessionId, snapshot: content)
    isLoadingSnapshot = false

    terminalManager.fitTerminal { [weak self] cols, rows in
      self?.wsClient?.sendPtyResize(sessionId: agent.sessionId, cols: cols, rows: rows)
    }

    // Start background polling to catch updates not forwarded via WebSocket
    startPolling()
  }

  // MARK: - Send Message

  @MainActor
  func sendMessage(_ text: String) async -> Bool {
    guard let agent = activeAgent, !text.isEmpty, let client = apiClient else { return false }

    // Send via HTTP invoke (reliable, proven to work)
    do {
      _ = try await client.invoke(channel: "pty:write", payload: [
        "sessionId": agent.sessionId,
        "data": text + "\n",
        "encoding": "utf8",
      ])
      startAggressivePolling()
      return true
    } catch {
      print("[Send] Failed: \(error)")
      return false
    }
  }

  // MARK: - Snapshot Polling

  /// Background polling every 3s to catch updates not forwarded via WebSocket events.
  /// The proxy relies on the desktop renderer to echo PTY events — this is a fallback.
  private func startPolling() {
    stopPolling()
    pollTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
      Task { @MainActor in
        await self?.pollSnapshot()
      }
    }
  }

  /// After sending a message, poll more frequently (every 1s for 15s) to catch the response.
  private func startAggressivePolling() {
    stopPolling()
    var pollCount = 0
    pollTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] timer in
      pollCount += 1
      Task { @MainActor in
        await self?.pollSnapshot()
      }
      if pollCount >= 15 {
        timer.invalidate()
        self?.startPolling() // Go back to normal polling
      }
    }
  }

  private func stopPolling() {
    pollTimer?.invalidate()
    pollTimer = nil
  }

  @MainActor
  private func pollSnapshot() async {
    guard let agent = activeAgent,
          let client = apiClient else { return }

    guard let snapshot = try? await client.fetchSnapshot(sessionId: agent.sessionId),
          !snapshot.isEmpty else { return }

    // Only update if content changed
    if snapshot.count != lastSnapshotLength {
      lastSnapshotLength = snapshot.count
      terminalManager.clearAndLoadSession(sessionId: agent.sessionId, snapshot: snapshot)
    }
  }

  // MARK: - Refresh

  @MainActor
  func refreshAgents() async {
    guard let client = apiClient else { return }
    if let result = try? await client.fetchWorkspaceNodes() {
      let currentSessionId = activeAgent?.sessionId
      agents = result.agents
      scrollbackByNodeId.merge(result.scrollbackByNodeId) { _, new in new }

      for agent in result.agents {
        wsClient?.sendRequest(channel: "pty:attach", payload: ["sessionId": agent.sessionId])
      }

      if let sid = currentSessionId,
         let idx = agents.firstIndex(where: { $0.sessionId == sid }) {
        activeAgentIndex = idx
      } else if !agents.isEmpty {
        await activateAgent(at: 0)
      }
    }
  }

  // MARK: - Agent State

  @MainActor
  private func handleAgentStateChange(sessionId: String, state: String) {
    guard let idx = agents.firstIndex(where: { $0.sessionId == sessionId }) else { return }
    let newStatus = AgentStatus(rawValue: state) ?? .unknown
    agents[idx].status = newStatus

    if state == "standby" && idx != activeAgentIndex {
      sendLocalNotification(
        title: agents[idx].displayTitle,
        body: "Agent is ready for input"
      )
    }
  }

  @MainActor
  private func handleAgentExit(sessionId: String, exitCode: Int) {
    guard let idx = agents.firstIndex(where: { $0.sessionId == sessionId }) else { return }
    agents[idx].status = exitCode == 0 ? .exited : .failed
  }

  private func sendLocalNotification(title: String, body: String) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    let request = UNNotificationRequest(
      identifier: UUID().uuidString,
      content: content,
      trigger: nil
    )
    UNUserNotificationCenter.current().add(request)
  }

  func disconnect() {
    stopPolling()
    wsClient?.disconnect()
    wsClient = nil
    apiClient = nil
    isConnected = false
    agents = []
    activeAgentIndex = 0
    connectionConfig = nil
    connectionError = nil
    scrollbackByNodeId = [:]
    terminalManager.isReady = false
    terminalManager.currentSessionId = nil
  }
}
