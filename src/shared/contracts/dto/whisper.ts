export interface WhisperTranscribeInput {
  audioBase64: string
  filename: string
}

export interface WhisperTranscribeResult {
  text: string
  success: boolean
  processingTime?: number
}

export interface WhisperAuthResult {
  token: string
}

export interface WhisperHistoryInput {
  token: string
}

export interface WhisperHistoryItem {
  text: string
  timestamp: string
}

export interface WhisperHistoryResult {
  items: WhisperHistoryItem[]
}
