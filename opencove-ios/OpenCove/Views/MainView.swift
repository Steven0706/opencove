import SwiftUI

struct MainView: View {
  @Environment(AppState.self) private var appState

  var body: some View {
    VStack(spacing: 0) {
      // Agent Switcher
      AgentSwitcherView()

      // Terminal
      ZStack {
        Color.bgPrimary

        if appState.agents.isEmpty {
          emptyState
        } else if let agent = appState.activeAgent {
          TerminalView(sessionId: agent.sessionId)
            .transition(.opacity)

          if appState.isLoadingSnapshot {
            ProgressView()
              .tint(Color.coveAccent)
              .scaleEffect(1.2)
          }
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .gesture(swipeGesture)

      // Chat Input
      ChatInputBar()
    }
    .background(Color.bgPrimary)
  }

  private var emptyState: some View {
    VStack(spacing: 16) {
      Image(systemName: "rectangle.on.rectangle.slash")
        .font(.system(size: 40))
        .foregroundStyle(Color.textSecondary.opacity(0.5))
      Text("No active agents")
        .font(.headline)
        .foregroundStyle(Color.textSecondary)
      Text("Start an agent from your Mac")
        .font(.subheadline)
        .foregroundStyle(Color.textSecondary.opacity(0.7))

      Button("Refresh") {
        Task { await appState.refreshAgents() }
      }
      .buttonStyle(.bordered)
      .tint(Color.coveAccent)
      .padding(.top, 8)
    }
  }

  private var swipeGesture: some Gesture {
    DragGesture(minimumDistance: 60, coordinateSpace: .local)
      .onEnded { value in
        let horizontal = value.translation.width
        let vertical = abs(value.translation.height)
        // Only horizontal swipes (ignore vertical scrolls)
        guard abs(horizontal) > vertical * 1.5 else { return }
        Task {
          if horizontal < 0 {
            await appState.switchToNextAgent()
          } else {
            await appState.switchToPreviousAgent()
          }
        }
      }
  }
}

// MARK: - Agent Switcher

struct AgentSwitcherView: View {
  @Environment(AppState.self) private var appState

  var body: some View {
    VStack(spacing: 0) {
      ScrollViewReader { proxy in
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 6) {
            ForEach(Array(appState.agents.enumerated()), id: \.element.id) { index, agent in
              AgentPill(agent: agent, isActive: index == appState.activeAgentIndex)
                .id(index)
                .onTapGesture {
                  Task { await appState.switchToAgent(at: index) }
                }
            }

            // Refresh button
            Button {
              Task { await appState.refreshAgents() }
            } label: {
              Image(systemName: "arrow.clockwise")
                .font(.caption2)
                .foregroundStyle(Color.textSecondary)
                .frame(width: 32, height: 32)
                .background(Color.bgTertiary)
                .clipShape(Circle())
            }
          }
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
        }
        .onChange(of: appState.activeAgentIndex) { _, newValue in
          withAnimation(.easeOut(duration: 0.2)) {
            proxy.scrollTo(newValue, anchor: .center)
          }
        }
      }

      Divider()
        .overlay(Color.borderSubtle)
    }
    .glassBackground()
  }
}

struct AgentPill: View {
  let agent: AgentNode
  let isActive: Bool

  var body: some View {
    HStack(spacing: 6) {
      StatusDot(agent.status, size: 7)

      Image(systemName: agent.providerIcon)
        .font(.system(size: 10))
        .foregroundStyle(isActive ? Color.coveAccent : Color.textSecondary)

      Text(agent.displayTitle)
        .font(.system(size: 12, weight: isActive ? .semibold : .regular))
        .foregroundStyle(isActive ? .white : Color.textSecondary)
        .lineLimit(1)
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 7)
    .background(isActive ? Color.coveAccent.opacity(0.15) : Color.bgTertiary)
    .clipShape(Capsule())
    .overlay(
      Capsule()
        .stroke(isActive ? Color.coveAccent.opacity(0.5) : .clear, lineWidth: 1)
    )
    .animation(.easeOut(duration: 0.2), value: isActive)
  }
}

// MARK: - Disconnect Menu

extension MainView {
  @ViewBuilder
  var disconnectButton: some View {
    Menu {
      Button(role: .destructive) {
        appState.disconnect()
      } label: {
        Label("Disconnect", systemImage: "xmark.circle")
      }
    } label: {
      Image(systemName: "ellipsis.circle")
        .font(.caption)
        .foregroundStyle(Color.textSecondary)
    }
  }
}
