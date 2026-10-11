import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Circle,
  Group,
  Image as KonvaImage,
  Label,
  Layer as KonvaLayer,
  Line,
  Rect,
  Stage,
  Tag,
  Text,
  Transformer,
} from 'react-konva'
import Konva from 'konva'
import { imageToWorld, normalizeDegrees, slideIndexAt, totalWidth, worldToImage, type Box } from '../lib/carousel'
import type { SubjectPoint } from '../lib/choose-subject'
import { facesOnEdges, type FaceMap } from '../lib/face-edges'
import { getImage } from '../lib/image-registry'
import { drawLayerContent } from '../lib/layer-effects'
import { collectSnapTargets, snapBox, type SnapGuides } from '../lib/snap-guides'
import type { CarouselDoc, Layer } from '../types'

const ACCENT = '#5b36d6'
const SNAP_COLOR = '#16a34a'
const FACE_COLOR = '#f59e0b'
const KEEP_COLOR = '#16a34a'
const REMOVE_COLOR = '#dc2626'
const OVERFLOW_OPACITY = 0.3
const MIN_PAD = 96
/** Below this on-screen slide width the stage scrolls sideways instead of shrinking further. */
const MIN_SLIDE_PX = 150
/** Holding a tap this long while choosing a subject takes the spot away instead of adding it. */
const LONG_PRESS_MS = 450
/** A press that moves further than this many screen pixels isn't a tap. */
const TAP_SLOP = 10

const ALL_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-right',
  'middle-left',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]
const CORNER_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

let checker: HTMLCanvasElement | null = null
function getChecker(): HTMLCanvasElement {
  if (checker) return checker
  checker = document.createElement('canvas')
  checker.width = 32
  checker.height = 32
  const g = checker.getContext('2d')
  if (g) {
    g.fillStyle = '#f0f0f0'
    g.fillRect(0, 0, 32, 32)
    g.fillStyle = '#dcdcdc'
    g.fillRect(0, 0, 16, 16)
    g.fillRect(16, 16, 16, 16)
  }
  return checker
}

/** Unrotated box of a center-anchored node, in world pixels. */
function nodeBox(node: Konva.Node) {
  const w = Math.abs(node.width() * node.scaleX())
  const h = Math.abs(node.height() * node.scaleY())
  return { x: node.x() - w / 2, y: node.y() - h / 2, width: w, height: h }
}

function syncTwin(stage: Konva.Stage | null, layerId: string, node: Konva.Node) {
  const twin = stage?.findOne(`#in-${layerId}`)
  twin?.setAttrs({
    x: node.x(),
    y: node.y(),
    width: node.width(),
    height: node.height(),
    offsetX: node.offsetX(),
    offsetY: node.offsetY(),
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation(),
  })
}

/**
 * Konva props for a layer, rotating and flipping around its center. It draws through the same
 * `drawLayerContent` as the export, so outlines, shadows and blur match; hit testing stays the
 * image's box. The faded copy leaves out the shadow, which would otherwise darken twice under
 * the full-opacity copy.
 */
function layerNodeProps(l: Layer, scale: number, shadow: boolean) {
  return {
    image: getImage(l.imageId)?.image,
    x: l.x + l.width / 2,
    y: l.y + l.height / 2,
    width: l.width,
    height: l.height,
    offsetX: l.width / 2,
    offsetY: l.height / 2,
    rotation: l.rotation,
    scaleX: l.flipX ? -1 : 1,
    sceneFunc: (context: Konva.Context, shape: Konva.Shape) => {
      // Mid-transform the node's own size leads the doc's.
      const live = { ...l, width: shape.width(), height: shape.height() }
      drawLayerContent(context._context, live, scale * context.getCanvas().getPixelRatio(), { shadow })
    },
  }
}

/** A layer drawn plainly in its box, for overlays that line up with it. */
function boxNodeProps(l: Layer) {
  return {
    x: l.x + l.width / 2,
    y: l.y + l.height / 2,
    width: l.width,
    height: l.height,
    offsetX: l.width / 2,
    offsetY: l.height / 2,
    rotation: l.rotation,
    scaleX: l.flipX ? -1 : 1,
  }
}

/** Marks that overlap most of another are the same face seen twice (a photo and its cutout). */
function distinctBoxes(boxes: Box[]): Box[] {
  const kept: Box[] = []
  for (const b of boxes) {
    const dup = kept.some((k) => {
      const w = Math.min(k.x + k.width, b.x + b.width) - Math.max(k.x, b.x)
      const h = Math.min(k.y + k.height, b.y + b.height) - Math.max(k.y, b.y)
      return w > 0 && h > 0 && w * h > 0.6 * Math.min(k.width * k.height, b.width * b.height)
    })
    if (!dup) kept.push(b)
  }
  return kept
}

/** Choosing a subject in one layer: the taps so far and, once ready, the preview of the choice. */
export type StagePicking = { layerId: string; points: SubjectPoint[]; overlay: HTMLCanvasElement | null }

type Props = {
  doc: CarouselDoc
  selectedId: string | null
  activeSlide: number
  /** Faces found in each image, so faces on a slide edge can be marked. */
  faces: FaceMap
  /** While set, taps on that layer choose its subject instead of selecting or moving anything. */
  picking: StagePicking | null
  onPick: (point: SubjectPoint) => void
  onSelect: (layerId: string) => void
  /** Pressed empty canvas: the slide under the pointer, or null outside the slides. */
  onBackgroundPress: (slideIndex: number | null) => void
  onLayerChange: (layerId: string, patch: Partial<Layer>) => void
}

export function CarouselStage({
  doc,
  selectedId,
  activeSlide,
  faces,
  picking,
  onPick,
  onSelect,
  onBackgroundPress,
  onLayerChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const press = useRef<{ x: number; y: number; timer: number; done: boolean } | null>(null)
  const [viewport, setViewport] = useState({ w: 800, h: 500 })
  const [guides, setGuides] = useState<SnapGuides>({ v: [], h: [] })
  /** The layer being dragged or transformed, as it is right now, so its face marks follow it. */
  const [live, setLive] = useState<{ id: string; patch: Partial<Layer> } | null>(null)

  const worldW = totalWidth(doc)
  const snapTargets = useMemo(() => collectSnapTargets(doc), [doc])
  const slides = Array.from({ length: doc.count }, (_, i) => i)

  const padX = Math.max(MIN_PAD, Math.round(doc.slideW * 0.08))
  const padY = Math.max(MIN_PAD, Math.round(doc.slideH * 0.08))
  const world = { x: -padX, y: -padY, width: worldW + padX * 2, height: doc.slideH + padY * 2 }

  // Fit the whole row when it fits; past MIN_SLIDE_PX per slide, scroll sideways instead.
  const fitH = Math.max(80, viewport.h - 16) / world.height
  const fitW = Math.max(80, viewport.w - 16) / world.width
  let scale = Math.min(fitH, fitW, 1)
  const minScale = MIN_SLIDE_PX / doc.slideW
  if (scale < minScale) scale = Math.min(fitH, minScale)
  const stageW = Math.max(1, Math.round(world.width * scale))
  const stageH = Math.max(1, Math.round(world.height * scale))
  const snapThreshold = 8 / scale

  const selected = doc.layers.find((l) => l.id === selectedId) ?? null
  const lockAspect = selected?.lockAspect ?? true
  const rotated = selected ? Math.abs(normalizeDegrees(selected.rotation)) > 0.5 : false
  const pickLayer = picking ? (doc.layers.find((l) => l.id === picking.layerId) ?? null) : null

  // Faces only re-map while a layer moves; finding them is done once per image, elsewhere.
  const markDoc = live
    ? { ...doc, layers: doc.layers.map((l) => (l.id === live.id ? { ...l, ...live.patch } : l)) }
    : doc
  const faceMarks = picking ? [] : distinctBoxes(facesOnEdges(markDoc, faces).map((m) => m.box))

  const trackLive = (layer: Layer, node: Konva.Node) => {
    if (!faces[layer.imageId]?.length) return
    setLive({
      id: layer.id,
      patch: { ...nodeBox(node), rotation: node.rotation(), flipX: node.scaleX() < 0 },
    })
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // ResizeObserver reports the initial size as soon as it starts observing.
    const ro = new ResizeObserver(() => {
      setViewport({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const isPicking = picking !== null
  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    const node = selectedId && !isPicking ? tr.getStage()?.findOne(`#layer-${selectedId}`) : undefined
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedId, doc.layers, scale, isPicking])

  const pointerWorld = (e: Konva.KonvaEventObject<Event>) => {
    const p = e.target.getStage()?.getPointerPosition()
    return p ? { x: p.x / scale + world.x, y: p.y / scale + world.y } : null
  }

  const handleStagePress = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (picking) return
    for (let n: Konva.Node | null = e.target; n; n = n.getParent()) {
      if (n.getClassName() === 'Transformer') return
    }
    const p = pointerWorld(e)
    if (!p) return onBackgroundPress(null)
    const inside = p.x >= 0 && p.x < worldW && p.y >= 0 && p.y < doc.slideH
    onBackgroundPress(inside ? slideIndexAt(doc, p.x) : null)
  }

  /** A tap on the picked layer, in its image's pixels. Taps outside its image are ignored. */
  const pick = (x: number, y: number, keep: boolean) => {
    const point = pickLayer ? worldToImage(pickLayer, x, y) : null
    if (point) onPick({ ...point, keep })
  }

  const endPress = () => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }

  // A tap adds; Shift or a long press takes away. The long press fires while still held.
  const pickDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (!picking) return
    endPress()
    const p = pointerWorld(e)
    if (!p) return
    if (e.evt.shiftKey) return pick(p.x, p.y, false)
    const state = { ...p, timer: 0, done: false }
    state.timer = window.setTimeout(() => {
      state.done = true
      pick(state.x, state.y, false)
    }, LONG_PRESS_MS)
    press.current = state
  }

  const pickMove = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const state = press.current
    const p = state && !state.done ? pointerWorld(e) : null
    if (state && p && Math.hypot(p.x - state.x, p.y - state.y) * scale > TAP_SLOP) endPress()
  }

  const pickUp = () => {
    const state = press.current
    endPress()
    if (state && !state.done) pick(state.x, state.y, true)
  }

  const snapNode = (node: Konva.Node) => {
    const box = nodeBox(node)
    const snapped = snapBox(box, snapTargets.xs, snapTargets.ys, snapThreshold)
    node.x(snapped.x + box.width / 2)
    node.y(snapped.y + box.height / 2)
    setGuides(snapped.guides)
  }

  const finishTransform = (layerId: string, node: Konva.Node) => {
    const sx = node.scaleX()
    const w = Math.max(8, Math.abs(node.width() * sx))
    const h = Math.max(8, Math.abs(node.height() * node.scaleY()))
    const flipX = sx < 0
    node.setAttrs({ width: w, height: h, scaleX: flipX ? -1 : 1, scaleY: 1, offsetX: w / 2, offsetY: h / 2 })
    onLayerChange(layerId, {
      x: node.x() - w / 2,
      y: node.y() - h / 2,
      width: w,
      height: h,
      rotation: normalizeDegrees(node.rotation()),
      flipX,
    })
  }

  const clipSlides = (ctx: Konva.Context) => {
    ctx.beginPath()
    ctx.rect(0, 0, worldW, doc.slideH)
  }

  const setCursor = (e: Konva.KonvaEventObject<MouseEvent>, cursor: string) => {
    const container = e.target.getStage()?.container()
    if (container) container.style.cursor = cursor
  }

  return (
    <div ref={containerRef} className={`stage ${picking ? 'is-picking' : ''}`}>
      <div className="stage-canvas" style={{ width: stageW, height: stageH }}>
        <Stage
          width={stageW}
          height={stageH}
          onMouseDown={handleStagePress}
          onTouchStart={handleStagePress}
          onPointerDown={pickDown}
          onPointerMove={pickMove}
          onPointerUp={pickUp}
          onPointerCancel={endPress}
          onContextMenu={(e) => {
            // A long press would otherwise open the browser's menu.
            if (picking) e.evt.preventDefault()
          }}
        >
          <KonvaLayer>
            <Group x={-world.x * scale} y={-world.y * scale} scaleX={scale} scaleY={scale}>
              <Rect
                x={0}
                y={0}
                width={worldW}
                height={doc.slideH}
                fill={doc.background ?? undefined}
                fillPatternImage={doc.background ? undefined : (getChecker() as unknown as HTMLImageElement)}
                fillPatternScale={doc.background ? undefined : { x: 1 / scale, y: 1 / scale }}
                listening={false}
              />

              {/* Faded, interactive copies: what you grab, and the Transformer's target. */}
              <Group listening={!picking}>
                {doc.layers.map((layer) => (
                  <KonvaImage
                    key={`layer-${layer.id}`}
                    id={`layer-${layer.id}`}
                    {...layerNodeProps(layer, scale, false)}
                    opacity={OVERFLOW_OPACITY}
                    draggable
                    onMouseEnter={(e) => setCursor(e, 'move')}
                    onMouseLeave={(e) => setCursor(e, 'default')}
                    onMouseDown={(e) => {
                      e.cancelBubble = true
                      onSelect(layer.id)
                    }}
                    onTouchStart={(e) => {
                      e.cancelBubble = true
                      onSelect(layer.id)
                    }}
                    onDragMove={(e) => {
                      snapNode(e.target)
                      syncTwin(e.target.getStage(), layer.id, e.target)
                      trackLive(layer, e.target)
                    }}
                    onDragEnd={(e) => {
                      const box = nodeBox(e.target)
                      setGuides({ v: [], h: [] })
                      setLive(null)
                      onLayerChange(layer.id, { x: box.x, y: box.y })
                    }}
                    onTransform={(e) => {
                      syncTwin(e.target.getStage(), layer.id, e.target)
                      trackLive(layer, e.target)
                    }}
                    onTransformEnd={(e) => {
                      setLive(null)
                      finishTransform(layer.id, e.target)
                    }}
                  />
                ))}
              </Group>

              {/* Full-opacity copies clipped to the slides: what actually gets exported. */}
              <Group clipFunc={clipSlides} listening={false}>
                {doc.layers.map((layer) => (
                  <KonvaImage
                    key={`in-${layer.id}`}
                    id={`in-${layer.id}`}
                    {...layerNodeProps(layer, scale, true)}
                    listening={false}
                  />
                ))}
              </Group>

              {slides.map((i) => {
                const ox = i * doc.slideW
                const lines: number[][] = []
                for (let c = 1; c < doc.gridCols; c++) {
                  const x = ox + (c * doc.slideW) / doc.gridCols
                  lines.push([x, 0, x, doc.slideH])
                }
                for (let r = 1; r < doc.gridRows; r++) {
                  const y = (r * doc.slideH) / doc.gridRows
                  lines.push([ox, y, ox + doc.slideW, y])
                }
                return lines.map((points, k) => (
                  <Line
                    key={`grid-${i}-${k}`}
                    points={points}
                    stroke={ACCENT}
                    strokeWidth={1 / scale}
                    dash={[6 / scale, 4 / scale]}
                    opacity={0.8}
                    listening={false}
                  />
                ))
              })}

              {slides.slice(1).map((i) => (
                <Group key={`seam-${i}`} listening={false}>
                  <Line points={[i * doc.slideW, 0, i * doc.slideW, doc.slideH]} stroke="rgba(29,27,24,0.35)" strokeWidth={3 / scale} />
                  <Line
                    points={[i * doc.slideW, 0, i * doc.slideW, doc.slideH]}
                    stroke="#ffffff"
                    strokeWidth={1.5 / scale}
                    dash={[8 / scale, 6 / scale]}
                  />
                </Group>
              ))}

              <Rect x={0} y={0} width={worldW} height={doc.slideH} stroke="rgba(29,27,24,0.45)" strokeWidth={1 / scale} listening={false} />
              {!selectedId && activeSlide < doc.count ? (
                <Rect
                  x={activeSlide * doc.slideW}
                  y={0}
                  width={doc.slideW}
                  height={doc.slideH}
                  stroke={ACCENT}
                  strokeWidth={2 / scale}
                  listening={false}
                />
              ) : null}

              {slides.map((i) => (
                <Label key={`num-${i}`} x={i * doc.slideW + 10 / scale} y={10 / scale} scaleX={1 / scale} scaleY={1 / scale} listening={false}>
                  <Tag fill={i === activeSlide ? ACCENT : 'rgba(29,27,24,0.72)'} cornerRadius={10} />
                  <Text text={String(i + 1)} fontFamily="IBM Plex Mono, ui-monospace, monospace" fontSize={12} fill="#ffffff" padding={5} />
                </Label>
              ))}

              {faceMarks.map((box, i) => (
                <Group key={`face-${i}`} listening={false}>
                  <Rect
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    cornerRadius={Math.min(box.width, box.height) * 0.3}
                    fill="rgba(245, 158, 11, 0.16)"
                    stroke={FACE_COLOR}
                    strokeWidth={2.5 / scale}
                  />
                  <Label x={box.x} y={box.y - 22 / scale} scaleX={1 / scale} scaleY={1 / scale}>
                    <Tag fill={FACE_COLOR} cornerRadius={8} />
                    <Text text="Face on slide edge" fontSize={11} fill="#1d1b18" padding={4} />
                  </Label>
                </Group>
              ))}

              {pickLayer && picking?.overlay ? (
                <KonvaImage image={picking.overlay} {...boxNodeProps(pickLayer)} listening={false} />
              ) : null}
              {pickLayer
                ? picking?.points.map((p, i) => {
                    const at = imageToWorld(pickLayer, p.x, p.y)
                    return (
                      <Circle
                        key={`pick-${i}`}
                        x={at.x}
                        y={at.y}
                        radius={7 / scale}
                        fill={p.keep ? KEEP_COLOR : REMOVE_COLOR}
                        stroke="#ffffff"
                        strokeWidth={2 / scale}
                        listening={false}
                      />
                    )
                  })
                : null}

              {guides.v.map((x) => (
                <Line key={`snap-v-${x}`} points={[x, world.y, x, world.y + world.height]} stroke={SNAP_COLOR} strokeWidth={1.5 / scale} listening={false} />
              ))}
              {guides.h.map((y) => (
                <Line key={`snap-h-${y}`} points={[world.x, y, world.x + world.width, y]} stroke={SNAP_COLOR} strokeWidth={1.5 / scale} listening={false} />
              ))}

              <Transformer
                ref={trRef}
                rotateEnabled
                flipEnabled={false}
                keepRatio={lockAspect}
                enabledAnchors={lockAspect && rotated ? CORNER_ANCHORS : ALL_ANCHORS}
                rotationSnaps={[0, 90, 180, 270]}
                rotationSnapTolerance={4}
                rotateAnchorOffset={28}
                anchorSize={11}
                anchorCornerRadius={3}
                anchorStroke={ACCENT}
                anchorFill="#ffffff"
                borderStroke={ACCENT}
                borderStrokeWidth={2}
                boundBoxFunc={(oldBox, newBox) => {
                  if (Math.abs(newBox.width) < 12 || Math.abs(newBox.height) < 12) return oldBox
                  if (!lockAspect || Math.abs(oldBox.rotation) > 0.001) return newBox

                  // keepRatio only covers corner anchors; hold the ratio on edge anchors too.
                  const absOldW = Math.abs(oldBox.width)
                  const absOldH = Math.abs(oldBox.height)
                  if (absOldW < 1 || absOldH < 1) return newBox
                  const ratio = absOldW / absOldH
                  const dw = Math.abs(Math.abs(newBox.width) - absOldW)
                  const dh = Math.abs(Math.abs(newBox.height) - absOldH)

                  if (dw >= dh) {
                    const signH = newBox.height < 0 ? -1 : 1
                    const newAbsH = Math.abs(newBox.width) / ratio
                    const centerY = oldBox.y + oldBox.height / 2
                    return { ...newBox, height: newAbsH * signH, y: centerY - (newAbsH * signH) / 2 }
                  }
                  const signW = newBox.width < 0 ? -1 : 1
                  const newAbsW = Math.abs(newBox.height) * ratio
                  const centerX = oldBox.x + oldBox.width / 2
                  return { ...newBox, width: newAbsW * signW, x: centerX - (newAbsW * signW) / 2 }
                }}
              />
            </Group>
          </KonvaLayer>
        </Stage>
      </div>
    </div>
  )
}
