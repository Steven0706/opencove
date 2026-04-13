import SwiftUI

struct ChatInputBar: View {
  @Environment(AppState.self) private var appState
  @State private var text = ""
  @State private var isRecording = false
  @State private var recordingDuration: TimeInterval = 0
  @State private var isTranscribing = false
  @State private var isSending = false
  @State private var voiceRecorder = VoiceRecorder()
  @State private var recordingTimer: Timer?
  @FocusState private var isFocused: Bool

  var body: some View {
    VStack(spacing: 0) {
      Divider()
        .overlay(Color.borderSubtle)

      if isRecording {
        recordingView
      } else {
        inputView
      }
    }
    .glassBackground()
  }

  // MARK: - Normal Input

  private var inputView: some View {
    HStack(spacing: 10) {
      // Voice button
      Button(action: startRecording) {
        Image(systemName: "mic.fill")
          .font(.system(size: 18))
          .foregroundStyle(Color.textSecondary)
          .frame(width: 36, height: 36)
      }
      .disabled(appState.activeAgent == nil)

      // Text field
      TextField("Message...", text: $text, axis: .vertical)
        .textFieldStyle(.plain)
        .font(.system(size: 15))
        .foregroundStyle(.white)
        .lineLimit(1...6)
        .focused($isFocused)
        .submitLabel(.send)
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(Color.bgTertiary)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(
          RoundedRectangle(cornerRadius: 20)
            .stroke(isFocused ? Color.coveAccent.opacity(0.4) : Color.borderSubtle, lineWidth: 1)
        )
        .onSubmit { sendMessage() }

      // Send button
      Button(action: sendMessage) {
        if isSending {
          ProgressView()
            .scaleEffect(0.7)
            .tint(Color.coveAccent)
            .frame(width: 30, height: 30)
        } else {
          Image(systemName: "arrow.up.circle.fill")
            .font(.system(size: 30))
            .symbolRenderingMode(.hierarchical)
            .foregroundStyle(canSend ? Color.coveAccent : Color.textSecondary.opacity(0.3))
        }
      }
      .disabled(!canSend)

      // Menu
      disconnectMenu
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    .padding(.bottom, 4)
  }

  // MARK: - Recording View

  private var recordingView: some View {
    VStack(spacing: 12) {
      HStack(spacing: 12) {
        Circle()
          .fill(.red)
          .frame(width: 10, height: 10)
          .shadow(color: .red.opacity(0.6), radius: 4)
          .modifier(PulseAnimation())

        if isTranscribing {
          HStack(spacing: 6) {
            ProgressView()
              .tint(.white)
              .scaleEffect(0.7)
            Text("Transcribing...")
              .font(.system(size: 14))
              .foregroundStyle(Color.textSecondary)
          }
        } else {
          Text("Recording \(formattedDuration)")
            .font(.system(size: 14, design: .monospaced))
            .foregroundStyle(.white)
        }

        Spacer()
      }

      HStack(spacing: 20) {
        Button(action: cancelRecording) {
          Text("Cancel")
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(.white.opacity(0.7))
            .frame(maxWidth: .infinity)
            .frame(height: 40)
            .background(Color.bgTertiary)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .disabled(isTranscribing)

        Button(action: stopAndTranscribe) {
          HStack(spacing: 6) {
            Image(systemName: "checkmark")
              .font(.system(size: 12, weight: .bold))
            Text("Done")
              .font(.system(size: 14, weight: .semibold))
          }
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity)
          .frame(height: 40)
          .background(Color.coveAccent)
          .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .disabled(isTranscribing)
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
    .padding(.bottom, 4)
  }

  // MARK: - Actions

  private var canSend: Bool {
    !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && !isSending
      && appState.activeAgent != nil
  }

  private func sendMessage() {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, !isSending else { return }

    let messageText = trimmed
    text = ""
    isSending = true
    isFocused = false

    Task {
      let success = await appState.sendMessage(messageText)
      isSending = false
      if !success {
        text = messageText // Restore text on failure
      }
    }
  }

  private func startRecording() {
    recordingDuration = 0
    voiceRecorder.startRecording()
    isRecording = true

    recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
      recordingDuration += 0.1
    }
  }

  private func stopAndTranscribe() {
    recordingTimer?.invalidate()
    recordingTimer = nil
    isTranscribing = true

    Task {
      if let audioData = voiceRecorder.stopRecording() {
        do {
          let transcription = try await appState.apiClient?.transcribe(audioData: audioData)
          if let transcription, !transcription.isEmpty {
            text = transcription
            isFocused = true
          }
        } catch {
          print("Transcription error: \(error)")
        }
      }
      isTranscribing = false
      isRecording = false
    }
  }

  private func cancelRecording() {
    recordingTimer?.invalidate()
    recordingTimer = nil
    voiceRecorder.stopRecording()
    isRecording = false
    isTranscribing = false
  }

  private var formattedDuration: String {
    let seconds = Int(recordingDuration)
    return String(format: "%d:%02d", seconds / 60, seconds % 60)
  }

  private var disconnectMenu: some View {
    Menu {
      Button("Refresh Agents", systemImage: "arrow.clockwise") {
        Task { await appState.refreshAgents() }
      }
      Divider()
      Button("Disconnect", systemImage: "xmark.circle", role: .destructive) {
        appState.disconnect()
      }
    } label: {
      Image(systemName: "ellipsis")
        .font(.system(size: 14))
        .foregroundStyle(Color.textSecondary)
        .frame(width: 28, height: 36)
    }
  }
}

private struct PulseAnimation: ViewModifier {
  @State private var isPulsing = false

  func body(content: Content) -> some View {
    content
      .opacity(isPulsing ? 0.4 : 1.0)
      .onAppear {
        withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
          isPulsing = true
        }
      }
  }
}
