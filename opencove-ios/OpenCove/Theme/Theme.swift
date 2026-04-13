import SwiftUI

extension Color {
  static let bgPrimary = Color(hex: "0D0D0D")
  static let bgSecondary = Color(hex: "1A1A1A")
  static let bgTertiary = Color(hex: "252525")
  static let bgElevated = Color(hex: "1E1E2E")
  static let coveAccent = Color(hex: "4ECDC4")
  static let textPrimary = Color(hex: "E0E0E0")
  static let textSecondary = Color(hex: "888888")
  static let borderSubtle = Color.white.opacity(0.08)
}

extension Color {
  init(hex: String) {
    let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var int: UInt64 = 0
    Scanner(string: hex).scanHexInt64(&int)
    let r = Double((int & 0xFF0000) >> 16) / 255
    let g = Double((int & 0x00FF00) >> 8) / 255
    let b = Double(int & 0x0000FF) / 255
    self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
  }
}

extension View {
  func glassBackground() -> some View {
    self
      .background(.ultraThinMaterial)
      .background(Color.bgPrimary.opacity(0.7))
  }
}

struct StatusDot: View {
  let status: AgentStatus
  let size: CGFloat

  init(_ status: AgentStatus, size: CGFloat = 8) {
    self.status = status
    self.size = size
  }

  var body: some View {
    Circle()
      .fill(status.color)
      .frame(width: size, height: size)
      .shadow(color: status.color.opacity(0.5), radius: status == .running ? 3 : 0)
  }
}
