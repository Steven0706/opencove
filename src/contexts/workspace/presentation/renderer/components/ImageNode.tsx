import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { CanvasImageMimeType } from '@shared/contracts/dto'
import type { NodeFrame, Point } from '../types'
import { NodeResizeHandles } from './shared/NodeResizeHandles'
import { useNodeFrameResize } from '../utils/nodeFrameResize'
import { resolveCanonicalNodeMinSize } from '../utils/workspaceNodeSizing'

interface ImageNodeInteractionOptions {
  normalizeViewport?: boolean
  selectNode?: boolean
  shiftKey?: boolean
}

interface ImageNodeProps {
  assetId: string
  mimeType: CanvasImageMimeType
  fileName: string | null
  naturalWidth: number | null
  naturalHeight: number | null
  nodeNumber?: number
  position: Point
  width: number
  height: number
  onClose: () => void
  onResize: (frame: NodeFrame) => void
  onInteractionStart?: (options?: ImageNodeInteractionOptions) => void
  isMaximized?: boolean
  onToggleMaximize?: () => void
}

export function ImageNode({
  assetId,
  mimeType,
  fileName,
  naturalWidth,
  naturalHeight,
  nodeNumber,
  position,
  width,
  height,
  onClose,
  onResize,
  onInteractionStart,
  isMaximized,
  onToggleMaximize,
}: ImageNodeProps): JSX.Element {
  const { t } = useTranslation()
  const aspectRatio = useMemo(() => {
    if (
      typeof naturalWidth !== 'number' ||
      !Number.isFinite(naturalWidth) ||
      naturalWidth <= 0 ||
      typeof naturalHeight !== 'number' ||
      !Number.isFinite(naturalHeight) ||
      naturalHeight <= 0
    ) {
      return null
    }

    return naturalWidth / naturalHeight
  }, [naturalHeight, naturalWidth])
  const { draftFrame, handleResizePointerDown } = useNodeFrameResize({
    position,
    width,
    height,
    minSize: resolveCanonicalNodeMinSize('image'),
    aspectRatio,
    onResize,
  })
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isMissing, setIsMissing] = useState(false)

  useEffect(() => {
    let canceled = false
    let objectUrl: string | null = null

    setImageUrl(null)
    setIsMissing(false)

    const readCanvasImage = window.opencoveApi?.workspace?.readCanvasImage
    if (typeof readCanvasImage !== 'function') {
      setIsMissing(true)
      return () => undefined
    }

    void readCanvasImage({ assetId })
      .then(result => {
        if (canceled) {
          return
        }

        if (!result || !(result.bytes instanceof Uint8Array) || result.bytes.byteLength === 0) {
          setImageUrl(null)
          setIsMissing(true)
          return
        }

        objectUrl = URL.createObjectURL(new Blob([result.bytes], { type: mimeType }))
        setImageUrl(objectUrl)
      })
      .catch(() => {
        if (!canceled) {
          setImageUrl(null)
          setIsMissing(true)
        }
      })

    return () => {
      canceled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [assetId, mimeType])

  const renderedFrame = draftFrame ?? {
    position,
    size: { width, height },
  }

  const style = useMemo(
    () => ({
      width: renderedFrame.size.width,
      height: renderedFrame.size.height,
      transform:
        renderedFrame.position.x !== position.x || renderedFrame.position.y !== position.y
          ? `translate(${renderedFrame.position.x - position.x}px, ${renderedFrame.position.y - position.y}px)`
          : undefined,
    }),
    [
      position.x,
      position.y,
      renderedFrame.position.x,
      renderedFrame.position.y,
      renderedFrame.size.height,
      renderedFrame.size.width,
    ],
  )

  return (
    <div
      className="image-node"
      style={style}
      data-node-drag-handle="true"
      onClickCapture={event => {
        if (event.button !== 0 || !(event.target instanceof Element)) {
          return
        }

        if (event.target.closest('.nodrag')) {
          return
        }

        event.stopPropagation()
        onInteractionStart?.({ shiftKey: event.shiftKey })
      }}
    >
      {imageUrl ? (
        <img className="image-node__img" src={imageUrl} draggable={false} alt={fileName ?? ''} />
      ) : (
        <div
          className="image-node__placeholder"
          aria-hidden="true"
          data-image-missing={isMissing ? 'true' : 'false'}
        />
      )}

      {nodeNumber != null ? (
        <span className="image-node__number">#{nodeNumber}</span>
      ) : null}

      {onToggleMaximize ? (
        <button
          type="button"
          className="image-node__maximize nodrag"
          onClick={event => {
            event.stopPropagation()
            onToggleMaximize()
          }}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      ) : null}

      <button
        type="button"
        className="image-node__close nodrag"
        onClick={event => {
          event.stopPropagation()
          onClose()
        }}
        aria-label={t('imageNode.deleteImage')}
        title={t('imageNode.deleteImage')}
      >
        ×
      </button>

      <NodeResizeHandles
        classNamePrefix="image-node"
        testIdPrefix="image-resizer"
        handleResizePointerDown={handleResizePointerDown}
      />
    </div>
  )
}
