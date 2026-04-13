import XCTest
@testable import OpenCove

final class NetworkingTests: XCTestCase {

  let config = ConnectionConfig(host: "localhost", port: 3200, token: "")

  // MARK: - 1. Health Check

  func testHealthCheck() async throws {
    let client = APIClient(config: config)
    try await client.healthCheck()
  }

  // MARK: - 2. Fetch Workspace Nodes

  func testFetchNodes() async throws {
    let client = APIClient(config: config)
    let result = try await client.fetchWorkspaceNodes()
    XCTAssertFalse(result.agents.isEmpty, "Should find at least one agent")
    let first = result.agents[0]
    XCTAssertFalse(first.sessionId.isEmpty, "Agent should have a sessionId")
    XCTAssertFalse(first.title.isEmpty, "Agent should have a title")
    print("[TEST] Found \(result.agents.count) agents, first: \(first.title) sid=\(first.sessionId.prefix(12))")
    print("[TEST] Scrollback entries: \(result.scrollbackByNodeId.count)")
  }

  // MARK: - 3. PTY Snapshot

  func testSnapshot() async throws {
    let client = APIClient(config: config)
    let result = try await client.fetchWorkspaceNodes()
    guard let agent = result.agents.first else {
      XCTFail("No agents"); return
    }
    let snapshot = try await client.fetchSnapshot(sessionId: agent.sessionId)
    // Snapshot may be nil/empty for inactive sessions — check scrollback fallback
    let scrollback = result.scrollbackByNodeId[agent.id]
    let hasContent = (snapshot != nil && !snapshot!.isEmpty) || (scrollback != nil && !scrollback!.isEmpty)
    XCTAssertTrue(hasContent, "Should have either snapshot or scrollback for agent \(agent.title)")
    print("[TEST] Snapshot: \(snapshot?.count ?? 0) chars, Scrollback: \(scrollback?.count ?? 0) chars")
  }

  // MARK: - 4. WebSocket Connect + Hello

  func testWebSocketConnect() async throws {
    let ws = WebSocketClient(config: config)

    let helloExpectation = expectation(description: "WS hello received")
    ws.onConnected = { helloExpectation.fulfill() }
    ws.connect()

    await fulfillment(of: [helloExpectation], timeout: 5)
    print("[TEST] WebSocket connected OK")
    ws.disconnect()
  }

  // MARK: - 5. PTY Attach + Receive Data

  func testPtyAttachReceivesData() async throws {
    let client = APIClient(config: config)
    let result = try await client.fetchWorkspaceNodes()
    guard let agent = result.agents.first else {
      XCTFail("No agents"); return
    }

    let ws = WebSocketClient(config: config)

    let helloExpectation = expectation(description: "WS hello")
    ws.onConnected = { helloExpectation.fulfill() }
    ws.connect()
    await fulfillment(of: [helloExpectation], timeout: 5)

    // Attach to session
    ws.sendRequest(channel: "pty:attach", payload: ["sessionId": agent.sessionId])

    // Should receive at least one pty:data event
    let dataExpectation = expectation(description: "PTY data received")
    var receivedData = false
    ws.onPtyData = { sid, data in
      if !receivedData {
        receivedData = true
        print("[TEST] Received PTY data for \(sid.prefix(12)): \(data.count) chars")
        dataExpectation.fulfill()
      }
    }

    // Wait - some sessions broadcast periodic data
    await fulfillment(of: [dataExpectation], timeout: 10)
    ws.disconnect()
  }

  // MARK: - 6. PTY Write (Send Message)

  func testPtyWrite() async throws {
    let client = APIClient(config: config)
    let result = try await client.fetchWorkspaceNodes()
    // Find a standby agent that can accept input
    guard let agent = result.agents.first(where: { $0.status == .standby }) else {
      print("[TEST] No standby agent found, skipping write test")
      return
    }

    let ws = WebSocketClient(config: config)

    let helloExpectation = expectation(description: "WS hello")
    ws.onConnected = { helloExpectation.fulfill() }
    ws.connect()
    await fulfillment(of: [helloExpectation], timeout: 5)

    // Attach first
    ws.sendRequest(channel: "pty:attach", payload: ["sessionId": agent.sessionId])

    // Wait a moment for attach to process
    try await Task.sleep(nanoseconds: 500_000_000)

    // Send a harmless message — just a newline (won't execute anything dangerous)
    ws.sendPtyWrite(sessionId: agent.sessionId, data: "\n")
    print("[TEST] pty-write sent to \(agent.title) (\(agent.sessionId.prefix(12)))")

    // Should receive echo/response
    let responseExpectation = expectation(description: "Response after write")
    ws.onPtyData = { sid, data in
      if sid == agent.sessionId {
        print("[TEST] Got response: \(data.count) chars")
        responseExpectation.fulfill()
      }
    }

    await fulfillment(of: [responseExpectation], timeout: 10)
    print("[TEST] PTY write + response: OK")
    ws.disconnect()
  }

  // MARK: - 7. Full AppState Flow

  func testFullAppStateFlow() async throws {
    let appState = AppState()

    await appState.connect(host: "localhost", port: "3200", token: "")

    XCTAssertTrue(appState.isConnected, "Should be connected")
    XCTAssertFalse(appState.agents.isEmpty, "Should have agents")
    XCTAssertNotNil(appState.activeAgent, "Should have active agent")
    XCTAssertNotNil(appState.wsClient, "Should have WS client")

    let agent = appState.activeAgent!
    print("[TEST] Active agent: \(agent.title) sid=\(agent.sessionId.prefix(12)) status=\(agent.status)")

    // Verify WS is connected by waiting a moment
    try await Task.sleep(nanoseconds: 1_000_000_000)

    // Test sendMessage
    print("[TEST] Sending test message...")
    await appState.sendMessage("test from iOS\n")

    // Wait for response
    try await Task.sleep(nanoseconds: 2_000_000_000)
    print("[TEST] Full AppState flow: OK")

    appState.disconnect()
  }
}
