export interface WhisperTranscribeInput {
  audioBase64: string
  filename?: string
}

export interface WhisperTranscribeResult {
  text: string
  success: boolean
  processingTime?: number
}
