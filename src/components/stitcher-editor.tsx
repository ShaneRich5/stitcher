import { useEffect, useEffectEvent, useRef, useState, type DragEvent } from 'react'
import {
  createDoc,
  cropLayerImage,
  duplicateLayer,
  insertLayerAbove,
  layerZoom,
  makeLayer,
  moveLayer,
  normalizeDegrees,
  relayout,
  removeSlide,
  replaceLayerImage,
  resetToFit,
  setSlideCount,
  zoomLayer,
} from '../lib/carousel'
import { downloadBlob } from '../lib/download'
import {
  canShareFiles,
  renderSlideFiles,
  shareSlideFiles,
  zipSlideFiles,
  type ImageFormat,
} from '../lib/export-carousel'
import type { PickerStatus, SubjectChoice, SubjectPoint } from '../lib/choose-subject'
import { facesOnEdges, nudgeOffEdges, type FaceMap } from '../lib/face-edges'
import { imageFiles, loadImageFile } from '../lib/load-image'
import { flushSave, loadProject, scheduleSave } from '../lib/persist-project'
import { cutoutFromMask, removeBackground, type Cutout } from '../lib/remove-background'
import { useEditorHistory } from '../lib/use-editor-history'
import { useMediaQuery } from '../lib/use-media-query'
import { useSlideThumbnails } from '../lib/use-slide-thumbnails'
import type { CarouselDoc, FitMode, Layer } from '../types'
import { AppNav } from './app-nav'
import { CarouselControls } from './carousel-controls'
import { CarouselStage } from './carousel-stage'
import { Icon } from './icons'
import { ImageControls, SubjectPicker, type CutoutMode } from './image-controls'
import { SlideStrip } from './slide-strip'
import { SwipePreview } from './swipe-preview'

const NUDGE = 4
/** How much Portrait blurs the photo behind its subject, in world pixels. */
const PORTRAIT_BLUR = 16
/** Faces are looked for this long after the images settle, so loading photos comes first. */
const FACE_CHECK_DELAY = 800

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable
}

/** Choosing the subject to cut out of one layer's photo by tapping it. */
type Picking = {
  layerId: string
  imageId: string
  points: SubjectPoint[]
  /** The subject the taps pick, once the models have answered; null before the first tap. */
  choice: SubjectChoice | null
  /** True while the models are working on the latest taps. */
  working: boolean
}

function pickerMessage(status: PickerStatus): string {
  if (status.step === 'reading') return 'Reading the photo…'
  const what = status.model === 'picker' ? 'subject picker' : 'background remover'
  return status.fraction < 1 ? `Downloading the ${what}… ${Math.round(status.fraction * 100)}%` : 'Reading the photo…'
}

export function StitcherEditor() {
  const { present: doc, commit, undo, redo, reset, canUndo, canRedo } = useEditorHistory<CarouselDoc>(createDoc)
  const [hydrated, setHydrated] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeSlideRaw, setActiveSlide] = useState(0)
  const [dockTab, setDockTab] = useState<'carousel' | 'image'>('carousel')
  const [exportFormat, setExportFormat] = useState<ImageFormat>('png')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Progress text while a background is being removed; null when idle. */
  const [cutoutStatus, setCutoutStatus] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  /** Faces found so far, per image. Images not in here haven't been searched yet. */
  const [faces, setFaces] = useState<FaceMap>({})
  const [picking, setPicking] = useState<Picking | null>(null)
  /** Loading text while the subject picker opens; null once it's ready. */
  const [pickerStatus, setPickerStatus] = useState<string | null>(null)
  const pickerOpen = useRef<Promise<void> | null>(null)
  /** Counts subject requests, so a slow answer to older taps can't replace a newer one. */
  const pickRequest = useRef(0)
  const noticeTimer = useRef<number | undefined>(undefined)
  const isPhone = useMediaQuery('(max-width: 820px)')
  const canShare = canShareFiles()

  const activeSlide = Math.min(activeSlideRaw, doc.count - 1)
  const selected = doc.layers.find((l) => l.id === selectedId) ?? null
  const thumbs = useSlideThumbnails(doc, 96)
  const hasImages = doc.layers.length > 0
  const showImageTab = isPhone && selected !== null && dockTab === 'image'
  // Picking ends by itself if its layer is deselected, deleted or given another photo.
  const activePick =
    picking && selected?.id === picking.layerId && selected.imageId === picking.imageId ? picking : null
  const selectedFacesOnEdge = selected
    ? facesOnEdges(doc, faces).filter((m) => m.layerId === selected.id).length
    : 0
  const imageKey = [...new Set(doc.layers.map((l) => l.imageId))].join('|')
  const checkFaces = hydrated && doc.count > 1

  // Restore the last autosaved project once, then let the autosave effect below take over. The
  // restore bypasses undo history (`reset`) since it isn't a user edit.
  useEffect(() => {
    let cancelled = false
    void loadProject().then((saved) => {
      if (cancelled) return
      if (saved) reset(saved)
      setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [reset])

  useEffect(() => {
    if (!hydrated) return
    scheduleSave(doc)
  }, [doc, hydrated])

  useEffect(() => {
    window.addEventListener('pagehide', flushSave)
    return () => {
      window.removeEventListener('pagehide', flushSave)
      flushSave()
    }
  }, [])

  // Look for faces in each new image, once, so faces on a slide edge can be flagged. It only runs
  // when the set of images changes, never during drags; moving a layer just re-maps the boxes.
  useEffect(() => {
    if (!checkFaces || !imageKey) return
    let live = true
    const timer = window.setTimeout(async () => {
      const { detectFaces } = await import('../lib/detect-faces')
      for (const id of imageKey.split('|')) {
        if (!live) return
        try {
          const boxes = await detectFaces(id)
          if (live) setFaces((f) => (f[id] ? f : { ...f, [id]: boxes }))
        } catch (e) {
          // Most likely the detector couldn't load (offline); try again when the images change.
          console.error(e)
          return
        }
      }
    }, FACE_CHECK_DELAY)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [checkFaces, imageKey])

  const say = (message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000)
  }

  const patchDoc = (fn: (d: CarouselDoc) => CarouselDoc, coalesce?: string) =>
    commit(fn, coalesce ? { coalesce } : undefined)

  const patchLayer = (id: string, fn: (d: CarouselDoc, l: Layer) => Layer, coalesce?: string) =>
    patchDoc(
      (d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? fn(d, l) : l)) }),
      coalesce,
    )

  const select = (id: string | null) => {
    setSelectedId(id)
    if (id) setDockTab('image')
    if (id !== picking?.layerId) setPicking(null)
  }

  const loadAll = async (files: File[]) => {
    const results = await Promise.allSettled(files.map(loadImageFile))
    const loaded = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    const failed = results.length - loaded.length
    if (failed) say(`Could not open ${failed} file${failed > 1 ? 's' : ''}`)
    return loaded
  }

  /** Put a single photo across every slide so it is split evenly. */
  const splitFile = async (file: File) => {
    const [img] = await loadAll([file])
    if (!img) return
    const layer = makeLayer(doc, img, 'fill')
    patchDoc((d) => ({ ...d, layers: [layer] }))
    setSelectedId(layer.id)
    setDockTab('image')
  }

  const addFiles = async (files: File[]) => {
    const images = await loadAll(files)
    if (!images.length) return
    if (!hasImages && images.length === 1) {
      const layer = makeLayer(doc, images[0]!, 'fill')
      patchDoc((d) => ({ ...d, layers: [layer] }))
      setSelectedId(layer.id)
      return
    }
    const start = hasImages ? activeSlide : 0
    const layers = images.map((img, i) => makeLayer(doc, img, 'free', Math.min(doc.count - 1, start + i)))
    patchDoc((d) => ({ ...d, layers: [...d.layers, ...layers] }))
    setSelectedId(layers[layers.length - 1]!.id)
    setDockTab('image')
  }

  const replaceFile = async (file: File) => {
    if (!selected) return
    const [img] = await loadAll([file])
    if (img) patchLayer(selected.id, (d, l) => replaceLayerImage(d, l, img))
  }

  /**
   * Place a cutout of a layer's photo (trimmed to its subject) exactly over where it was.
   * `replace` swaps the photo for it; `layer` keeps the photo and adds the subject above it;
   * `portrait` does the same and blurs the photo. Each is one undo step.
   */
  const placeCutout = (layerId: string, imageId: string, cutout: Cutout, mode: CutoutMode) => {
    const subjectId = crypto.randomUUID()
    let placed = false
    patchDoc((d) => {
      // Leave the doc alone if the layer was deleted or its photo replaced in the meantime.
      const original = d.layers.find((l) => l.id === layerId)
      if (original?.imageId !== imageId) return d
      placed = true
      const subject = cropLayerImage(original, cutout, cutout.crop)
      if (mode === 'replace') {
        return { ...d, layers: d.layers.map((l) => (l.id === layerId ? subject : l)) }
      }
      // A new layer starts plain: the photo's effects were meant for the photo.
      const added = insertLayerAbove(d, layerId, {
        ...subject,
        id: subjectId,
        outline: undefined,
        shadow: undefined,
        blur: undefined,
      })
      if (mode === 'layer') return added
      return { ...added, layers: added.layers.map((l) => (l.id === layerId ? { ...l, blur: PORTRAIT_BLUR } : l)) }
    })
    if (placed && mode !== 'replace') select(subjectId)
  }

  /** Cut the selected photo's subject out and place it with `placeCutout`. */
  const cutOutSelected = async (mode: CutoutMode) => {
    if (!selected || cutoutStatus) return
    const { id: layerId, imageId, name } = selected
    setCutoutStatus('Removing background…')
    try {
      const cutout = await removeBackground(
        imageId,
        name,
        (fraction) =>
          setCutoutStatus(
            fraction < 1 ? `Downloading the background remover… ${Math.round(fraction * 100)}%` : 'Removing background…',
          ),
        { trim: true },
      )
      placeCutout(layerId, imageId, cutout, mode)
    } catch (e) {
      console.error(e)
      say('Could not remove the background')
    } finally {
      setCutoutStatus(null)
    }
  }

  /** Start choosing the selected photo's subject by tapping it. The models load meanwhile. */
  const startPicking = async () => {
    if (!selected || cutoutStatus) return
    const { id: layerId, imageId } = selected
    pickRequest.current++
    setPicking({ layerId, imageId, points: [], choice: null, working: false })
    setPickerStatus('Loading the subject picker…')
    const opening = import('../lib/choose-subject').then(({ openSubjectPicker }) =>
      openSubjectPicker(imageId, (s) => setPickerStatus(pickerMessage(s))),
    )
    pickerOpen.current = opening
    try {
      await opening
    } catch (e) {
      console.error(e)
      say('Could not load the subject picker')
      setPicking((p) => (p?.imageId === imageId ? null : p))
    } finally {
      if (pickerOpen.current === opening) setPickerStatus(null)
    }
  }

  /** Ask the models for the subject these taps point at; the newest request wins. */
  const updatePick = async (pick: Picking, points: SubjectPoint[]) => {
    const request = ++pickRequest.current
    const current = (p: Picking | null) => p?.layerId === pick.layerId && p.imageId === pick.imageId
    setPicking({ ...pick, points, choice: points.length ? pick.choice : null, working: points.length > 0 })
    if (!points.length) return
    try {
      await pickerOpen.current
    } catch {
      return // Already reported by startPicking.
    }
    try {
      const { chooseSubject } = await import('../lib/choose-subject')
      const choice = await chooseSubject(pick.imageId, points)
      if (request === pickRequest.current) setPicking((p) => (current(p) ? { ...p!, choice, working: false } : p))
    } catch (e) {
      console.error(e)
      if (request !== pickRequest.current) return
      say('Could not find a subject there')
      setPicking((p) => (current(p) ? { ...p!, working: false } : p))
    }
  }

  const addPickPoint = (point: SubjectPoint) => {
    if (activePick) void updatePick(activePick, [...activePick.points, point])
  }

  const undoPickPoint = () => {
    if (activePick?.points.length) void updatePick(activePick, activePick.points.slice(0, -1))
  }

  const cancelPicking = () => {
    pickRequest.current++
    setPicking(null)
  }

  const confirmPick = async (mode: CutoutMode) => {
    if (!activePick?.choice || activePick.working || !selected || cutoutStatus) return
    const { layerId, imageId, choice } = activePick
    cancelPicking()
    setCutoutStatus('Cutting out…')
    try {
      const cutout = await cutoutFromMask(imageId, selected.name, choice.mask, { trim: true })
      placeCutout(layerId, imageId, cutout, mode)
    } catch (e) {
      console.error(e)
      say('Could not cut out that subject')
    } finally {
      setCutoutStatus(null)
    }
  }

  const nudgeSelected = () => {
    if (!selected) return
    const moved = nudgeOffEdges(doc, selected, faces)
    if (!moved) return say("Can't clear these faces with a small move. Try zooming out or moving the photo.")
    patchLayer(selected.id, () => moved)
  }

  const duplicateSelected = () => {
    if (!selected) return
    const copyId = crypto.randomUUID()
    const id = selected.id
    patchDoc((d) => duplicateLayer(d, id, copyId))
    select(copyId)
  }

  const deleteSelected = () => {
    if (!selected) return
    const id = selected.id
    patchDoc((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) }))
    setSelectedId(null)
    setDockTab('carousel')
  }

  const exportSlides = async (mode: 'download' | 'share') => {
    if (!hasImages || busy) return
    setBusy(true)
    try {
      const files = await renderSlideFiles(doc, exportFormat)
      if (mode === 'share') {
        await shareSlideFiles(files)
      } else if (files.length === 1) {
        downloadBlob(files[0]!.blob, files[0]!.filename)
      } else {
        downloadBlob(await zipSlideFiles(files), 'carousel.zip')
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        say(e instanceof Error ? e.message : 'Export failed')
      }
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (isTypingTarget(e.target) || previewOpen) return
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    if (activePick) {
      // While choosing a subject, undo takes back a tap and nothing else edits the doc.
      if (e.key === 'Escape') {
        cancelPicking()
      } else if (mod && key === 'z') {
        e.preventDefault()
        undoPickPoint()
      }
      return
    }
    if (mod && key === 'z') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    } else if (mod && key === 'y') {
      e.preventDefault()
      redo()
    } else if (selected && mod && key === 'd') {
      // Ctrl/Cmd + D would otherwise bookmark the page.
      e.preventDefault()
      duplicateSelected()
    } else if (selected && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault()
      deleteSelected()
    } else if (selected && e.key.startsWith('Arrow') && !mod) {
      e.preventDefault()
      const step = e.shiftKey ? NUDGE * 5 : NUDGE
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      patchLayer(selected.id, (_, l) => ({ ...l, x: l.x + dx, y: l.y + dy }), `nudge-${selected.id}`)
    } else if (e.key === 'Escape') {
      setSelectedId(null)
    }
  })

  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    if (isTypingTarget(e.target)) return
    const files = imageFiles(e.clipboardData?.files)
    if (files.length) {
      e.preventDefault()
      void addFiles(files)
    }
  })

  useEffect(() => {
    const down = (e: KeyboardEvent) => onKeyDown(e)
    const paste = (e: ClipboardEvent) => onPaste(e)
    window.addEventListener('keydown', down)
    window.addEventListener('paste', paste)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('paste', paste)
    }
  }, [])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = imageFiles(e.dataTransfer.files)
    if (files.length) void addFiles(files)
  }

  const setFit = (fit: FitMode) => selected && patchLayer(selected.id, (d, l) => resetToFit(d, l, fit))

  const carouselControls = (
    <CarouselControls
      doc={doc}
      exportFormat={exportFormat}
      onCount={(n) => patchDoc((d) => setSlideCount(d, n), 'count')}
      onFormat={(slideW, slideH) => patchDoc((d) => relayout(d, { ...d, slideW, slideH }))}
      onBackground={(background) => patchDoc((d) => ({ ...d, background }), 'background')}
      onGrid={(gridCols, gridRows) => patchDoc((d) => ({ ...d, gridCols, gridRows }))}
      onExportFormat={setExportFormat}
      onSplitFile={(f) => void splitFile(f)}
      onAddFiles={(f) => void addFiles(f)}
    />
  )

  const imageControls = activePick ? (
    <SubjectPicker
      variant={isPhone ? 'sheet' : 'toolbar'}
      status={pickerStatus ?? (activePick.working ? 'Finding the subject…' : null)}
      points={activePick.points.length}
      canConfirm={activePick.choice !== null && !activePick.working}
      onUndo={undoPickPoint}
      onCancel={cancelPicking}
      onConfirm={(mode) => void confirmPick(mode)}
    />
  ) : selected ? (
    <ImageControls
      layer={selected}
      zoom={layerZoom(doc, selected)}
      variant={isPhone ? 'sheet' : 'toolbar'}
      onFit={setFit}
      onZoom={(z) => patchLayer(selected.id, (d, l) => zoomLayer(d, l, z), `zoom-${selected.id}`)}
      onRotate={(deg) =>
        patchLayer(selected.id, (_, l) => ({ ...l, rotation: normalizeDegrees(deg) }), `rotate-${selected.id}`)
      }
      onRotate90={() => patchLayer(selected.id, (_, l) => ({ ...l, rotation: normalizeDegrees(l.rotation + 90) }))}
      onFlip={() => patchLayer(selected.id, (_, l) => ({ ...l, flipX: !l.flipX }))}
      onToggleLock={() => patchLayer(selected.id, (_, l) => ({ ...l, lockAspect: !l.lockAspect }))}
      onReplace={(f) => void replaceFile(f)}
      onDuplicate={duplicateSelected}
      onCutout={(mode) => void cutOutSelected(mode)}
      onChooseSubject={() => void startPicking()}
      removingBackground={cutoutStatus !== null}
      facesOnEdge={selectedFacesOnEdge}
      onNudge={nudgeSelected}
      onEffects={(patch, coalesce) =>
        patchLayer(selected.id, (_, l) => ({ ...l, ...patch }), coalesce && `${coalesce}-${selected.id}`)
      }
      onForward={() => patchDoc((d) => moveLayer(d, selected.id, 1))}
      onBackward={() => patchDoc((d) => moveLayer(d, selected.id, -1))}
      onDelete={deleteSelected}
    />
  ) : null

  const navActions = (
    <>
      <button type="button" className="icon-btn" aria-label="Undo" title="Undo" disabled={!canUndo} onClick={undo}>
        <Icon name="undo" />
      </button>
      <button type="button" className="icon-btn" aria-label="Redo" title="Redo" disabled={!canRedo} onClick={redo}>
        <Icon name="redo" />
      </button>
      <button
        type="button"
        className="btn btn-outline nav-preview"
        disabled={!hasImages}
        onClick={() => setPreviewOpen(true)}
      >
        <Icon name="eye" />
        <span>Preview</span>
      </button>
      {canShare && isPhone ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={!hasImages || busy}
          onClick={() => void exportSlides('share')}
        >
          <Icon name="share" />
          {busy ? 'Working…' : 'Save'}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          disabled={!hasImages || busy}
          onClick={() => void exportSlides('download')}
        >
          <Icon name="download" />
          {busy ? 'Working…' : `Export ${doc.count * doc.gridCols * doc.gridRows} ${exportFormat === 'png' ? 'PNG' : 'JPG'}`}
        </button>
      )}
    </>
  )

  return (
    <>
      <AppNav actions={navActions} />
      <div
        className={`editor ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault()
            setDragging(true)
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false)
        }}
        onDrop={onDrop}
      >
        {isPhone ? null : <div className="split-bar">{carouselControls}</div>}

        <div className="workspace">
          <CarouselStage
            doc={doc}
            selectedId={selectedId}
            activeSlide={activeSlide}
            faces={faces}
            picking={
              activePick
                ? { layerId: activePick.layerId, points: activePick.points, overlay: activePick.choice?.overlay ?? null }
                : null
            }
            onPick={addPickPoint}
            onSelect={select}
            onBackgroundPress={(i) => {
              setSelectedId(null)
              if (i !== null) setActiveSlide(i)
            }}
            onLayerChange={(id, patch) =>
              patchLayer(id, (_, l) => ({ ...l, ...patch }), `drag-${id}`)
            }
          />

          {!hasImages && hydrated ? (
            <div className="empty-state">
              <Icon name="scissors" size={28} />
              <h2>Split one photo across your carousel</h2>
              <p>
                Drop a wide photo here, paste one, or pick it below. It is sliced into {doc.count} slides that swipe
                as a single picture.
              </p>
              <label className="btn btn-primary">
                Choose a photo
                <input
                  type="file"
                  accept="image/*"
                  className="visually-hidden"
                  onChange={(e) => {
                    const files = imageFiles(e.target.files)
                    if (files.length) void addFiles(files)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          ) : null}

          {selected && !isPhone ? imageControls : null}
        </div>

        <SlideStrip
          doc={doc}
          thumbs={thumbs}
          activeSlide={activeSlide}
          onSelect={(i) => {
            setActiveSlide(i)
            setSelectedId(null)
            setPicking(null)
          }}
          onAdd={() => patchDoc((d) => setSlideCount(d, d.count + 1))}
          onRemove={(i) => patchDoc((d) => removeSlide(d, i))}
        />

        {isPhone ? (
          <div className="dock">
            <div className="dock-tabs" role="tablist" aria-label="Controls">
              <button
                type="button"
                role="tab"
                aria-selected={!showImageTab}
                className={!showImageTab ? 'on' : ''}
                onClick={() => setDockTab('carousel')}
              >
                Carousel
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={showImageTab}
                className={showImageTab ? 'on' : ''}
                disabled={!selected}
                onClick={() => setDockTab('image')}
              >
                Image
              </button>
            </div>
            <div className="dock-body">{showImageTab ? imageControls : carouselControls}</div>
          </div>
        ) : null}

        {dragging ? <div className="drop-overlay">Drop to add</div> : null}
        {cutoutStatus || notice ? (
          <div className="toast" role="status">
            {cutoutStatus ?? notice}
          </div>
        ) : null}
      </div>

      {previewOpen ? (
        <SwipePreview doc={doc} startIndex={activeSlide} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </>
  )
}
