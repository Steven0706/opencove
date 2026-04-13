import SwiftUI

struct ConnectView: View {
  @Environment(AppState.self) private var appState
  @AppStorage("lastHost") private var host = ""
  @AppStorage("lastPort") private var port = "3200"
  @AppStorage("lastToken") private var token = ""
  @FocusState private var focusedField: Field?

  private enum Field: Hashable {
    case host, port, token
  }

  var body: some View {
    ZStack {
      Color.bgPrimary.ignoresSafeArea()

      ScrollView {
        VStack(spacing: 40) {
          Spacer().frame(height: 60)

          // Logo
          VStack(spacing: 12) {
            ZStack {
              Circle()
                .fill(Color.coveAccent.opacity(0.1))
                .frame(width: 80, height: 80)
              Image(systemName: "point.3.connected.trianglepath.dotted")
                .font(.system(size: 36))
                .foregroundStyle(Color.coveAccent)
            }

            Text("OpenCove")
              .font(.system(size: 32, weight: .bold, design: .rounded))
              .foregroundStyle(.white)

            Text("Connect to your Mac workspace")
              .font(.subheadline)
              .foregroundStyle(Color.textSecondary)
          }

          // Form
          VStack(spacing: 16) {
            FormField(
              icon: "network",
              title: "Host",
              placeholder: "192.168.1.100",
              text: $host,
              keyboardType: .decimalPad
            )
            .focused($focusedField, equals: .host)

            FormField(
              icon: "number",
              title: "Port",
              placeholder: "3200",
              text: $port,
              keyboardType: .numberPad
            )
            .focused($focusedField, equals: .port)

            FormField(
              icon: "key.fill",
              title: "Token",
              placeholder: "Optional (proxy mode)",
              text: $token,
              isSecure: true
            )
            .focused($focusedField, equals: .token)
          }
          .padding(.horizontal, 24)

          // Connect button
          Button(action: { connectAction() }) {
            Group {
              if appState.isConnecting {
                HStack(spacing: 8) {
                  ProgressView()
                    .tint(.white)
                    .scaleEffect(0.8)
                  Text("Connecting...")
                }
              } else {
                Text("Connect")
                  .fontWeight(.semibold)
              }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(canConnect ? Color.coveAccent : Color.coveAccent.opacity(0.3))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
          }
          .disabled(!canConnect)
          .padding(.horizontal, 24)

          // Error
          if let error = appState.connectionError {
            HStack(spacing: 8) {
              Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .font(.caption)
              Text(error)
                .font(.caption)
                .foregroundStyle(.orange)
            }
            .padding(.horizontal, 24)
            .transition(.opacity.combined(with: .move(edge: .top)))
          }

          Spacer()
        }
      }
      .scrollDismissesKeyboard(.interactively)
    }
    .onSubmit { handleSubmit() }
  }

  private var canConnect: Bool {
    !host.isEmpty && !appState.isConnecting
  }

  private func connectAction() {
    focusedField = nil
    Task { await appState.connect(host: host, port: port, token: token) }
  }

  private func handleSubmit() {
    switch focusedField {
    case .host: focusedField = .port
    case .port: focusedField = .token
    case .token:
      if canConnect { connectAction() }
    case nil:
      break
    }
  }
}

private struct FormField: View {
  let icon: String
  let title: String
  let placeholder: String
  @Binding var text: String
  var keyboardType: UIKeyboardType = .default
  var isSecure: Bool = false

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Label(title, systemImage: icon)
        .font(.caption)
        .foregroundStyle(Color.textSecondary)

      Group {
        if isSecure {
          SecureField(placeholder, text: $text)
        } else {
          TextField(placeholder, text: $text)
            .keyboardType(keyboardType)
        }
      }
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .padding(.horizontal, 14)
      .padding(.vertical, 12)
      .background(Color.bgSecondary)
      .clipShape(RoundedRectangle(cornerRadius: 10))
      .overlay(
        RoundedRectangle(cornerRadius: 10)
          .stroke(Color.borderSubtle, lineWidth: 1)
      )
    }
  }
}
