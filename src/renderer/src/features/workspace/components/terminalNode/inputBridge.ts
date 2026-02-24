type UnsubscribeFn = () => void

export function registerXtermPasteGuards(container: HTMLElement | null): UnsubscribeFn {
  if (!container) {
    return () => undefined
  }

  const textarea = container.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')
  const xtermElement = container.querySelector<HTMLElement>('.xterm')

  const preventPasteDefault = (event: ClipboardEvent) => {
    event.preventDefault()
  }

  const preventBeforeInputPasteDefault = (event: InputEvent) => {
    if (event.inputType !== 'insertFromPaste' && event.inputType !== 'insertFromDrop') {
      return
    }

    event.preventDefault()
  }

  textarea?.addEventListener('paste', preventPasteDefault, true)
  textarea?.addEventListener('beforeinput', preventBeforeInputPasteDefault, true)
  xtermElement?.addEventListener('paste', preventPasteDefault, true)
  xtermElement?.addEventListener('beforeinput', preventBeforeInputPasteDefault, true)

  return () => {
    textarea?.removeEventListener('paste', preventPasteDefault, true)
    textarea?.removeEventListener('beforeinput', preventBeforeInputPasteDefault, true)
    xtermElement?.removeEventListener('paste', preventPasteDefault, true)
    xtermElement?.removeEventListener('beforeinput', preventBeforeInputPasteDefault, true)
  }
}

export function createPtyWriteQueue(write: (data: string) => Promise<void>): {
  enqueue: (data: string) => void
  flush: () => void
  dispose: () => void
} {
  let isDisposed = false
  const pendingChunks: string[] = []
  let pendingWrite: Promise<void> | null = null

  const flush = () => {
    if (isDisposed || pendingWrite || pendingChunks.length === 0) {
      return
    }

    const dataToWrite = pendingChunks.join('')
    pendingChunks.length = 0

    pendingWrite = write(dataToWrite)
      .catch(() => undefined)
      .finally(() => {
        pendingWrite = null
        flush()
      })
  }

  return {
    enqueue: data => {
      if (isDisposed || data.length === 0) {
        return
      }

      pendingChunks.push(data)
    },
    flush,
    dispose: () => {
      isDisposed = true
      pendingChunks.length = 0
      pendingWrite = null
    },
  }
}
