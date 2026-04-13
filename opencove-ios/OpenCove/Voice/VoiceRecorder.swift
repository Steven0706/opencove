import AVFoundation

final class VoiceRecorder {
  private var audioRecorder: AVAudioRecorder?
  private var fileURL: URL?

  @discardableResult
  func startRecording() -> Bool {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.record, mode: .default, options: [])
      try session.setActive(true)
    } catch {
      print("[Voice] Failed to configure audio session: \(error)")
      return false
    }

    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("opencove_recording_\(UUID().uuidString).wav")
    fileURL = url

    // 16kHz mono 16-bit PCM — optimal for Whisper
    let settings: [String: Any] = [
      AVFormatIDKey: Int(kAudioFormatLinearPCM),
      AVSampleRateKey: 16000.0,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
    ]

    do {
      audioRecorder = try AVAudioRecorder(url: url, settings: settings)
      audioRecorder?.record()
      return true
    } catch {
      print("[Voice] Failed to start recording: \(error)")
      return false
    }
  }

  @discardableResult
  func stopRecording() -> Data? {
    audioRecorder?.stop()
    audioRecorder = nil

    // Deactivate audio session
    try? AVAudioSession.sharedInstance().setActive(false)

    guard let url = fileURL else { return nil }
    defer {
      try? FileManager.default.removeItem(at: url)
      fileURL = nil
    }

    return try? Data(contentsOf: url)
  }

  var isRecording: Bool {
    audioRecorder?.isRecording ?? false
  }
}
