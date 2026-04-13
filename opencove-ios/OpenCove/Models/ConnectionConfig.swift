import Foundation

struct ConnectionConfig {
  let host: String
  let port: Int
  let token: String

  var baseURL: String { "http://\(host):\(port)" }
  var wsURL: String {
    token.isEmpty
      ? "ws://\(host):\(port)/api/ws"
      : "ws://\(host):\(port)/api/ws?token=\(token)"
  }
  var invokeURL: URL { URL(string: "\(baseURL)/api/invoke")! }
  var healthURL: URL { URL(string: "\(baseURL)/api/health")! }
}
