import { useEffect, useEffectEvent, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Circle,
  Group,
  Image as KonvaImage,
  Label,
  Layer as KonvaLayer,
  Line,
  Rect,
  Shape,
  Stage,
  Tag,
  Text,
  Transformer,
} from 'react-konva'
import Konva from 'konva'
import {
  imageToWorld,
  normalizeDegrees,
  profileGridCrop,
  slideIndexAt,
  totalWidth,
  worldToImage,
  type Box,
} from '../lib/carousel'
import type { SubjectPoint } from '../lib/choose-subject'
import { facesOnEdges, type FaceMap } from '../lib/face-edges'
import { getImage } from '../lib/image-registry'
import { drawLayerContent } from '../lib/layer-effects'
import { drawLightLeaks } from '../lib/light-leaks'
import { anchorEdges, collectSnapTargets, snapBox, snapResize, type SnapGuides } from '../lib/snap-guides'
import type { CarouselDoc, Layer } from '../types'
import { Icon } from './icons'

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
/** The closest zoom: screen pixels per world pixel. */
const MAX_ZOOM = 4
/** Each zoom button press, and the most one wheel notch can do. */
const ZOOM_STEP = 1.25
/** While zoomed, at least this much of the canvas stays on screen, so it can't be lost. */
const KEEP_VISIBLE = 64
/** The dark over the part of slide 1 the profile grid crops away. */
const GRID_SHADE = 'rgba(29, 27, 24, 0.55)'
const GRID_KEY = 'stitcher.carousel.profileGrid'

/** Remembering the overlay is a convenience, so a browser that blocks storage just gets it off. */
function readStoredGrid(): boolean {
  try {
    return localStorage.getItem(GRID_KEY) === 'on'
  } catch {
    return false
  }
}

/** Elements that Space would press or type into, so Space there isn't taken for panning. */
function usesSpace(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY', 'A'].includes(target.tagName) || target.isContentEditable
}

/**
 * A zoomed view: `scale` screen pixels per world pixel, with the world's origin at (x, y) in the
 * stage. Null means the automatic fit, which sizes the stage to the row and scrolls it sideways.
 */
type View = { scale: number; x: number; y: number }

/** The box Konva's Transformer passes to `boundBoxFunc`, in stage pixels. */
type TransformBox = { x: number; y: number; width: number; height: number; rotation: number }

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
function layerNodeProps(l: Layer, scale: number, shadow: boolean, row: { width: number; height: number }) {
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
      // Mid-drag or mid-transform the node leads the doc.
      const width = shape.width()
      const height = shape.height()
      const live = { ...l, width, height, x: shape.x() - width / 2, y: shape.y() - height / 2, rotation: shape.rotation() }
      drawLayerContent(context._context, live, scale * context.getCanvas().getPixelRatio(), { shadow, row })
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
  /** Studio's pan tool: dragging anywhere moves the view, as holding Space does. */
  panMode?: boolean
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
  panMode = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const press = useRef<{ x: number; y: number; timer: number; done: boolean } | null>(null)
  const pinch = useRef<{ dist: number; x: number; y: number } | null>(null)
  const [viewport, setViewport] = useState({ w: 800, h: 500 })
  const [view, setView] = useState<View | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [panning, setPanning] = useState(false)
  const [profileGrid, setProfileGrid] = useState(readStoredGrid)
  /**
   * Clean view: only the slides, as they'll be exported, with every guide, mark and handle hidden.
   * Nothing can be grabbed meanwhile, so a look can't nudge anything. Choosing a subject needs its
   * marks, so it's off while that's open.
   */
  const [cleanView, setCleanView] = useState(false)
  const [guides, setGuides] = useState<SnapGuides>({ v: [], h: [] })
  /** The layer being dragged or transformed, as it is right now, so its face marks follow it. */
  const [live, setLive] = useState<{ id: string; patch: Partial<Layer> } | null>(null)

  const worldW = totalWidth(doc)
  const row = { width: worldW, height: doc.slideH }
  const snapTargets = useMemo(() => collectSnapTargets(doc), [doc])
  const slides = Array.from({ length: doc.count }, (_, i) => i)

  const padX = Math.max(MIN_PAD, Math.round(doc.slideW * 0.08))
  const padY = Math.max(MIN_PAD, Math.round(doc.slideH * 0.08))
  const world = { x: -padX, y: -padY, width: worldW + padX * 2, height: doc.slideH + padY * 2 }

  // Fit the whole row when it fits; past MIN_SLIDE_PX per slide, scroll sideways instead.
  const fitH = Math.max(80, viewport.h - 16) / world.height
  const fitW = Math.max(80, viewport.w - 16) / world.width
  let fitScale = Math.min(fitH, fitW, 1)
  const minScale = MIN_SLIDE_PX / doc.slideW
  if (fitScale < minScale) fitScale = Math.min(fitH, minScale)
  // Zooming out can go past the fit, to see a long carousel whole.
  const minZoom = Math.min(fitH, fitW) / 2
  const scale = view?.scale ?? fitScale
  const stageW = view ? viewport.w : Math.max(1, Math.round(world.width * scale))
  const stageH = view ? viewport.h : Math.max(1, Math.round(world.height * scale))
  const origin = view ?? { x: -world.x * scale, y: -world.y * scale }
  const snapThreshold = 8 / scale
  const clean = cleanView && !picking
  const gridCrop = profileGrid && !clean ? profileGridCrop(doc) : null

  const selected = doc.layers.find((l) => l.id === selectedId) ?? null
  // Hidden layers aren't drawn; locked ones are drawn but let presses through to what's under them.
  const shown = doc.layers.filter((l) => !l.hidden)
  const canTransform = selected !== null && !selected.hidden && !selected.locked
  const lockAspect = selected?.lockAspect ?? true
  const rotated = selected ? Math.abs(normalizeDegrees(selected.rotation)) > 0.5 : false
  const pickLayer = picking ? (doc.layers.find((l) => l.id === picking.layerId) ?? null) : null

  // Faces only re-map while a layer moves; finding them is done once per image, elsewhere.
  const markDoc = live
    ? { ...doc, layers: doc.layers.map((l) => (l.id === live.id ? { ...l, ...live.patch } : l)) }
    : doc
  const faceMarks = picking || clean ? [] : distinctBoxes(facesOnEdges(markDoc, faces).map((m) => m.box))

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
    const node = canTransform && !isPicking ? tr.getStage()?.findOne(`#layer-${selectedId}`) : undefined
    tr.nodes(node && !clean ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedId, canTransform, doc.layers, scale, isPicking, clean])

  const pointerWorld = (e: Konva.KonvaEventObject<Event>) => {
    const p = e.target.getStage()?.getPointerPosition()
    return p ? { x: (p.x - origin.x) / scale, y: (p.y - origin.y) / scale } : null
  }

  useEffect(() => {
    try {
      localStorage.setItem(GRID_KEY, profileGrid ? 'on' : 'off')
    } catch {
      // A browser that blocks storage just won't remember the choice.
    }
  }, [profileGrid])

  /** Keep some of the canvas on screen whatever the pan. */
  const clampView = (v: View): View => {
    const left = v.x + world.x * v.scale
    const right = v.x + (world.x + world.width) * v.scale
    const top = v.y + world.y * v.scale
    const bottom = v.y + (world.y + world.height) * v.scale
    let { x, y } = v
    if (right < KEEP_VISIBLE) x += KEEP_VISIBLE - right
    else if (left > viewport.w - KEEP_VISIBLE) x -= left - (viewport.w - KEEP_VISIBLE)
    if (bottom < KEEP_VISIBLE) y += KEEP_VISIBLE - bottom
    else if (top > viewport.h - KEEP_VISIBLE) y -= top - (viewport.h - KEEP_VISIBLE)
    return { scale: v.scale, x, y }
  }

  /** The automatic fit as a view, measured where the canvas sits now, so zooming starts from it. */
  const currentView = (): View => {
    if (view) return view
    const c = containerRef.current?.getBoundingClientRect()
    const s = canvasRef.current?.getBoundingClientRect()
    const dx = c && s ? s.left - c.left : 0
    const dy = c && s ? s.top - c.top : 0
    return { scale, x: dx + origin.x, y: dy + origin.y }
  }

  /** Change the view from where it is now; changes within one frame build on each other. */
  const changeView = (fn: (v: View) => View) => {
    const base = currentView()
    setView((v) => clampView(fn(v ?? base)))
  }

  /** Scale by `factor` around (px, py), a point in the stage, so that point stays put. */
  const zoomAround = (v: View, factor: number, px: number, py: number): View => {
    const s = Math.min(MAX_ZOOM, Math.max(minZoom, v.scale * factor))
    return { scale: s, x: px - ((px - v.x) * s) / v.scale, y: py - ((py - v.y) * s) / v.scale }
  }

  /** A point on the page, in the stage's pixels. While zoomed the stage fills the container. */
  const toStage = (clientX: number, clientY: number) => {
    const c = containerRef.current?.getBoundingClientRect()
    return { x: clientX - (c?.left ?? 0), y: clientY - (c?.top ?? 0) }
  }

  const zoomBy = (factor: number) => changeView((v) => zoomAround(v, factor, viewport.w / 2, viewport.h / 2))

  // Ctrl/Cmd + wheel (and a trackpad pinch, which arrives as one) zooms around the pointer. While
  // zoomed the plain wheel pans; otherwise it scrolls the row as before.
  const onWheel = useEffectEvent((e: WheelEvent) => {
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewport.h : 1
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = Math.max(-60, Math.min(60, e.deltaY * unit))
      const p = toStage(e.clientX, e.clientY)
      changeView((v) => zoomAround(v, ZOOM_STEP ** (-delta / 60), p.x, p.y))
    } else if (view) {
      e.preventDefault()
      const sideways = e.shiftKey && !e.deltaX
      const dx = (sideways ? e.deltaY : e.deltaX) * unit
      const dy = (sideways ? 0 : e.deltaY) * unit
      changeView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }))
    }
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const wheel = (e: WheelEvent) => onWheel(e)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  // Holding Space turns any drag into a pan.
  const onSpace = useEffectEvent((e: KeyboardEvent, down: boolean) => {
    if (e.code !== 'Space' || (down && usesSpace(e.target))) return
    if (down) e.preventDefault()
    setSpaceHeld(down)
  })

  useEffect(() => {
    const down = (e: KeyboardEvent) => onSpace(e, true)
    const up = (e: KeyboardEvent) => onSpace(e, false)
    const blur = () => setSpaceHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  /** Drag the view with the pointer until it's released. */
  const startPan = (clientX: number, clientY: number) => {
    const base = currentView()
    setPanning(true)
    const move = (e: PointerEvent) =>
      setView(clampView({ ...base, x: base.x + e.clientX - clientX, y: base.y + e.clientY - clientY }))
    const end = () => {
      setPanning(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  /** Two fingers zoom and pan together; anything they started dragging is let go. */
  const pinchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches
    if (t.length !== 2) {
      pinch.current = null
      return
    }
    e.evt.preventDefault()
    e.target
      .getStage()
      ?.find('Image')
      .forEach((n) => {
        if (n.isDragging()) n.stopDrag()
      })
    trRef.current?.stopTransform()
    const a = t[0]!
    const b = t[1]!
    const at = toStage((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)
    const next = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), ...at }
    const prev = pinch.current
    pinch.current = next
    if (!prev || prev.dist < 1) return
    changeView((v) => {
      const zoomed = zoomAround(v, next.dist / prev.dist, prev.x, prev.y)
      return { ...zoomed, x: zoomed.x + next.x - prev.x, y: zoomed.y + next.y - prev.y }
    })
  }

  /**
   * Tab and Shift+Tab step through the layers bottom to top; past either end focus moves on, and
   * the layer stays selected. Enter jumps to the selected layer's toolbar (rotate, delete…).
   */
  const onStageKeyDown = (e: ReactKeyboardEvent) => {
    if (e.target !== e.currentTarget || picking || !doc.layers.length) return
    if (e.key === 'Enter' && selectedId) {
      const first = document.querySelector<HTMLElement>(
        ':is(.image-controls, .inspector) :is(button, input, select, summary)',
      )
      if (first) {
        e.preventDefault()
        first.focus()
      }
      return
    }
    if (e.key !== 'Tab') return
    const i = doc.layers.findIndex((l) => l.id === selectedId)
    const next = e.shiftKey ? (i < 0 ? doc.layers.length - 1 : i - 1) : i + 1
    if (next < 0 || next >= doc.layers.length) return
    e.preventDefault()
    onSelect(doc.layers[next]!.id)
  }

  const selectedIndex = selected ? doc.layers.indexOf(selected) : -1
  const announcement = selected ? `${selected.name} selected, layer ${selectedIndex + 1} of ${doc.layers.length}` : ''

  const handleStagePress = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (picking) return
    // While zoomed, dragging empty canvas pans (and still deselects, as a click there does).
    if (view && e.target === e.target.getStage() && 'button' in e.evt && e.evt.button === 0) {
      startPan(e.evt.clientX, e.evt.clientY)
    }
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

  /** The Transformer's box as a resize goes: never tiny, and keeping the shape when it's locked. */
  const holdShape = (oldBox: TransformBox, newBox: TransformBox): TransformBox => {
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
  }

  /** Snap the edges a resize moves to the slide sides and guides, unless the layer opts out. */
  const snapTransform = (oldBox: TransformBox, newBox: TransformBox): TransformBox => {
    const anchor = trRef.current?.getActiveAnchor()
    if (!anchor || anchor === 'rotater' || !selected || selected.snapOff || Math.abs(newBox.rotation) > 0.001) {
      return newBox
    }
    if (newBox.width <= 0 || newBox.height <= 0) return newBox
    const world = {
      x: (newBox.x - origin.x) / scale,
      y: (newBox.y - origin.y) / scale,
      width: newBox.width / scale,
      height: newBox.height / scale,
    }
    const ratio = lockAspect ? Math.abs(oldBox.width) / Math.max(1e-6, Math.abs(oldBox.height)) : null
    const snapped = snapResize(world, anchorEdges(anchor), snapTargets.xs, snapTargets.ys, snapThreshold, ratio)
    setGuides(snapped.guides)
    return {
      ...newBox,
      x: origin.x + snapped.x * scale,
      y: origin.y + snapped.y * scale,
      width: snapped.width * scale,
      height: snapped.height * scale,
    }
  }

  const finishTransform = (layerId: string, node: Konva.Node) => {
    const sx = node.scaleX()
    const w = Math.max(8, Math.abs(node.width() * sx))
    const h = Math.max(8, Math.abs(node.height() * node.scaleY()))
    const flipX = sx < 0
    node.setAttrs({ width: w, height: h, scaleX: flipX ? -1 : 1, scaleY: 1, offsetX: w / 2, offsetY: h / 2 })
    // React only re-applies props that changed, and the scale's prop is the same as before the
    // transform, so the clipped copy would keep the transform's scale on top of its new size.
    syncTwin(node.getStage(), layerId, node)
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
    <>
      <div
        ref={containerRef}
        className={`stage ${picking ? 'is-picking' : ''} ${view ? 'is-zoomed' : ''}`}
        tabIndex={0}
        role="application"
        aria-roledescription="carousel canvas"
        aria-label="Canvas. Tab and Shift+Tab select layers, arrow keys move the selected one, and Enter opens its controls."
        onKeyDown={(e) => {
          delete e.currentTarget.dataset.pointer
          onStageKeyDown(e)
        }}
        // A click right after a key press would show the keyboard focus ring; only Tab should.
        onPointerDown={(e) => {
          e.currentTarget.dataset.pointer = ''
        }}
        onBlur={(e) => {
          delete e.currentTarget.dataset.pointer
        }}
      >
        <div ref={canvasRef} className="stage-canvas" style={{ width: stageW, height: stageH }}>
          <Stage
            width={stageW}
            height={stageH}
            onMouseDown={handleStagePress}
            onTouchStart={handleStagePress}
            onTouchMove={pinchMove}
            onTouchEnd={() => {
              pinch.current = null
            }}
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
              <Group x={origin.x} y={origin.y} scaleX={scale} scaleY={scale}>
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
                <Group listening={!picking && !clean} visible={!clean}>
                  {shown.map((layer) => (
                    <KonvaImage
                      key={`layer-${layer.id}`}
                      id={`layer-${layer.id}`}
                      {...layerNodeProps(layer, scale, false, row)}
                      opacity={OVERFLOW_OPACITY}
                      listening={!layer.locked}
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
                        if (!layer.snapOff) snapNode(e.target)
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
                        setGuides({ v: [], h: [] })
                        setLive(null)
                        finishTransform(layer.id, e.target)
                      }}
                    />
                  ))}
                </Group>

                {/* Full-opacity copies clipped to the slides: what actually gets exported. */}
                <Group clipFunc={clipSlides} listening={false}>
                  {shown.map((layer) => (
                    <KonvaImage
                      key={`in-${layer.id}`}
                      id={`in-${layer.id}`}
                      {...layerNodeProps(layer, scale, true, row)}
                      listening={false}
                    />
                  ))}
                  {doc.lightLeaks && doc.lightLeaks.amount > 0 ? (
                    <Shape sceneFunc={(context) => drawLightLeaks(context._context, doc)} listening={false} />
                  ) : null}
                </Group>

                {gridCrop ? (
                  <Group listening={false}>
                    <Rect x={0} y={0} width={gridCrop.x} height={doc.slideH} fill={GRID_SHADE} />
                    <Rect
                      x={gridCrop.x + gridCrop.width}
                      y={0}
                      width={doc.slideW - gridCrop.x - gridCrop.width}
                      height={doc.slideH}
                      fill={GRID_SHADE}
                    />
                    <Rect x={gridCrop.x} y={0} width={gridCrop.width} height={gridCrop.y} fill={GRID_SHADE} />
                    <Rect
                      x={gridCrop.x}
                      y={gridCrop.y + gridCrop.height}
                      width={gridCrop.width}
                      height={doc.slideH - gridCrop.y - gridCrop.height}
                      fill={GRID_SHADE}
                    />
                    <Rect {...gridCrop} stroke="#ffffff" strokeWidth={1.5 / scale} dash={[6 / scale, 4 / scale]} />
                    <Label
                      x={gridCrop.x + gridCrop.width / 2}
                      y={gridCrop.y + gridCrop.height - 34 / scale}
                      scaleX={1 / scale}
                      scaleY={1 / scale}
                    >
                      <Tag fill="rgba(29,27,24,0.8)" cornerRadius={8} />
                      <Text text="Profile grid crop" fontSize={11} fill="#ffffff" padding={5} />
                    </Label>
                  </Group>
                ) : null}

                {clean ? null : (
                  <>
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
                  </>
                )}

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
                    const box = holdShape(oldBox, newBox)
                    return box === oldBox ? box : snapTransform(oldBox, box)
                  }}
                />
              </Group>
            </KonvaLayer>
          </Stage>
        </div>
      </div>
      {spaceHeld || panMode || panning ? (
        <div
          className={`stage-pan ${panning ? 'is-panning' : ''}`}
          onPointerDown={(e) => {
            e.preventDefault()
            startPan(e.clientX, e.clientY)
          }}
        />
      ) : null}
      <div className="zoom-bar" role="group" aria-label="View">
        <button type="button" className="icon-btn" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
          <Icon name="minus" size={16} />
        </button>
        <span className="zoom-value" title="Ctrl + scroll or pinch to zoom; hold Space and drag to pan">
          {Math.round(scale * 100)}%
        </span>
        <button type="button" className="icon-btn" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
          <Icon name="plus" size={16} />
        </button>
        <button type="button" className="zoom-btn" disabled={!view} title="Fit the slides on screen" onClick={() => setView(null)}>
          Fit
        </button>
        <button
          type="button"
          className="zoom-btn"
          aria-pressed={clean}
          disabled={!!picking}
          title={
            clean
              ? 'Show the slide numbers, edges, guides and handles again, to edit'
              : 'Hide the slide numbers, edges, guides and handles, to see the slides as they’ll be posted'
          }
          onClick={() => setCleanView((on) => !on)}
        >
          <Icon name={clean ? 'eye-off' : 'eye'} size={15} />
          Clean view
        </button>
        {profileGridCrop(doc) ? (
          <button
            type="button"
            className="zoom-btn"
            disabled={clean}
            aria-pressed={profileGrid}
            title="Shade what Instagram's profile grid crops from the first slide"
            onClick={() => setProfileGrid((on) => !on)}
          >
            Profile grid
          </button>
        ) : null}
      </div>
      <div className="visually-hidden" aria-live="polite">
        {announcement}
      </div>
    </>
  )
}
