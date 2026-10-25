import { isCursorMenuOpen, isPointerLocked, onPointerModeChange } from '../player/PointerMode.ts'
import { UI_SCALE } from './uiScale.ts'

/**
 * The in-game mouse of the inventory, block UIs and journal. Pointer lock
 * stays on while they are open (player/PointerMode.ts); the real mouse's
 * movement drives this pixel-art cursor instead, and its buttons and wheel
 * reach the menus as the events a free mouse would send - mousemove,
 * mouseover/out, mouseenter/leave, mousedown/up, click, wheel - at the
 * cursor's position, with the real event's modifier keys. So the menus need
 * nothing of their own: drag-drop, hover highlights and shift/ctrl-clicks
 * work as before.
 *
 * While the cursor is up, every real (trusted) mouse event is stopped at the
 * window before anything else sees it; the synthetic ones (untrusted) pass.
 * The browser's defaults that synthetic events don't get are done here:
 * focusing a clicked text field, scrolling the list under the wheel, and the
 * `title` tooltip.
 *
 * The cursor's shape tells what a click would do (Ben: "it should indicate
 * what's going to happen"): a registered shape provider decides first (the
 * inventory's drag-drop: an open hand over an item, a fist while dragging,
 * swap arrows with Ctrl held), else the CSS `cursor` of the element under it
 * (`pointer`: a pointing hand, a text field: an I-beam), else the arrow.
 */

export type CursorShape = 'arrow' | 'pointer' | 'grab' | 'grabbing' | 'transfer' | 'text'

/** What a shape provider sees: the element and point under the cursor, and the modifier keys held. */
export interface CursorContext {
  readonly target: Element | null
  readonly x: number
  readonly y: number
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
}

export type CursorShapeProvider = (context: CursorContext) => CursorShape | null

// B = outline, W = fill; `hot` = the pixel that points (the click lands there)
const SHAPES: Record<CursorShape, { hot: [number, number]; art: string[] }> = {
  arrow: { hot: [0, 0], art: [
    'B...........',
    'BB..........',
    'BWB.........',
    'BWWB........',
    'BWWWB.......',
    'BWWWWB......',
    'BWWWWWB.....',
    'BWWWWWWB....',
    'BWWWWWWWB...',
    'BWWWWWWWWB..',
    'BWWWWWWWWWB.',
    'BWWWWWWBBBBB',
    'BWWWBWWB....',
    'BWWBBWWB....',
    'BWB..BWWB...',
    'BB...BWWB...',
    'B.....BWWB..',
    '......BWWB..',
    '.......BB...',
  ] },
  pointer: { hot: [4, 0], art: [
    '....BB..........',
    '...BWWB.........',
    '...BWWB.........',
    '...BWWB.........',
    '...BWWBBB.......',
    '...BWWBWWBBB....',
    '...BWWBWWBWWBB..',
    '...BWWBWWBWWBWB.',
    'BB.BWWWWWWWWBWWB',
    'BWBBWWWWWWWWWWWB',
    'BWWBWWWWWWWWWWWB',
    '.BWWWWWWWWWWWWWB',
    '..BWWWWWWWWWWWWB',
    '..BWWWWWWWWWWWB.',
    '...BWWWWWWWWWWB.',
    '...BWWWWWWWWWB..',
    '....BWWWWWWWWB..',
    '....BWWWWWWWWB..',
    '....BBBBBBBBBB..',
  ] },
  grab: { hot: [8, 8], art: [
    '.....BB.BB.BB.....',
    '....BWWBWWBWWB....',
    '....BWWBWWBWWB....',
    '....BWWBWWBWWBBB..',
    '....BWWBWWBWWBWWB.',
    '....BWWBWWBWWBWWB.',
    '.BB.BWWBWWBWWBWWB.',
    'BWWBBWWBWWBWWBWWB.',
    'BWWWBWWWWWWWWWWWB.',
    '.BWWWBWWWWWWWWWWB.',
    '.BWWWWWWWWWWWWWWB.',
    '..BWWWWWWWWWWWWWB.',
    '..BWWWWWWWWWWWWB..',
    '...BWWWWWWWWWWWB..',
    '....BWWWWWWWWWB...',
    '.....BWWWWWWWWB...',
    '.....BWWWWWWWWB...',
    '.....BBBBBBBBBB...',
  ] },
  grabbing: { hot: [8, 9], art: [
    '..................',
    '..................',
    '..................',
    '..................',
    '.....BB.BB.BB.....',
    '....BWWBWWBWWBB...',
    '..BBBWWBWWBWWBWB..',
    '.BWWBWWBWWBWWBWWB.',
    '.BWWWWWWWWWWWWWWB.',
    '.BWWWWWWWWWWWWWWB.',
    '.BWWWWWWWWWWWWWWB.',
    '..BWWWWWWWWWWWWWB.',
    '..BWWWWWWWWWWWWB..',
    '...BWWWWWWWWWWWB..',
    '....BWWWWWWWWWB...',
    '.....BWWWWWWWWB...',
    '.....BWWWWWWWWB...',
    '.....BBBBBBBBBB...',
  ] },
  transfer: { hot: [9, 8], art: [
    '..........B.......',
    '..........BB......',
    '..........BWB.....',
    '.BBBBBBBBBBWWB....',
    '.BWWWWWWWWWWWWB...',
    '.BBBBBBBBBBWWB....',
    '..........BWB.....',
    '.....B....BB......',
    '....BB....B.......',
    '...BWB............',
    '..BWWBBBBBBBBBBB..',
    '.BWWWWWWWWWWWWWB..',
    '..BWWBBBBBBBBBBB..',
    '...BWB............',
    '....BB............',
    '.....B............',
  ] },
  text: { hot: [3, 8], art: [
    'BBB.BBB',
    'BWWBWWB',
    'BBBWBBB',
    '..BWB..',
    '..BWB..',
    '..BWB..',
    '..BWB..',
    '..BWB..',
    '..BWB..',
    '..BWB..',
    '..BWB..',
    '..BWB..',
    '..BWB..',
    'BBBWBBB',
    'BWWBWWB',
    'BBB.BBB',
  ] },
}
const OUTLINE = '#1b1712'
const FILL = '#f4efe2'
const SHADOW = 'rgba(0, 0, 0, 0.32)'
/** How long the cursor rests on an element with a `title` before it shows. */
const TITLE_DELAY_MS = 550
/** `buttons` bit of each `button` (left, middle, right, back, forward). */
const BUTTON_BITS = [1, 4, 2, 8, 16]
/** The real mouse events the cursor takes over while it is up. */
const CAPTURED = [
  'mousemove', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'wheel',
  'mouseover', 'mouseout', 'mouseenter', 'mouseleave',
  'pointermove', 'pointerdown', 'pointerup', 'pointerover', 'pointerout', 'pointerenter', 'pointerleave',
] as const
const TEXT_FIELD = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

const providers = new Set<CursorShapeProvider>()

/**
 * Let a menu choose the cursor's shape (asked every frame while the cursor is
 * up; return null to leave it to the next provider and the CSS cursor).
 * Returns an unregister function.
 */
export function addCursorShapeProvider(provider: CursorShapeProvider): () => void {
  providers.add(provider)
  return () => {
    providers.delete(provider)
  }
}

let installed = false

/** Create the cursor and start following the pointer mode. Call once, after `setPointerLockTarget`. */
export function installVirtualCursor(): void {
  if (installed) return
  installed = true

  // Whole device pixels per cursor pixel (crisp pixel art at any zoom), about 1.5 CSS px each at UI scale 1
  const dpr = window.devicePixelRatio || 1
  const scale = Math.max(1, Math.round(1.2 * UI_SCALE * dpr))
  const cssPixel = scale / dpr
  const sprites = new Map<CursorShape, HTMLCanvasElement>()
  for (const shape of Object.keys(SHAPES) as CursorShape[]) sprites.set(shape, drawSprite(SHAPES[shape].art, scale))

  const cursor = createCursorElement()
  const titleTip = createTitleTip()
  document.body.appendChild(cursor)
  document.body.appendChild(titleTip)
  const paint = cursor.getContext('2d')!

  let active = false
  let x = 0
  let y = 0
  let buttons = 0
  let hovered: Element | null = null
  let hoveredCss: CursorShape = 'arrow'
  let shape: CursorShape | null = null
  const pressedOn: (Element | null)[] = []
  const keys = { ctrl: false, shift: false, alt: false, meta: false }
  let titleTimer = 0
  let frame = 0

  function setShape(next: CursorShape): void {
    if (next === shape) return
    shape = next
    const sprite = sprites.get(next)!
    cursor.width = sprite.width
    cursor.height = sprite.height
    cursor.style.width = `${sprite.width / dpr}px`
    cursor.style.height = `${sprite.height / dpr}px`
    paint.clearRect(0, 0, cursor.width, cursor.height)
    paint.drawImage(sprite, 0, 0)
    place()
  }

  function place(): void {
    // The hotspot on the point, snapped to whole device pixels so the pixel art never resamples
    const [hotX, hotY] = SHAPES[shape ?? 'arrow'].hot
    const left = Math.round((x - (hotX + 0.5) * cssPixel) * dpr) / dpr
    const top = Math.round((y - (hotY + 0.5) * cssPixel) * dpr) / dpr
    cursor.style.transform = `translate3d(${left}px, ${top}px, 0)`
  }

  function updateShape(): void {
    if (!active) return
    const context: CursorContext = { target: hovered, x, y, ctrlKey: keys.ctrl, shiftKey: keys.shift, altKey: keys.alt }
    let next: CursorShape | null = null
    for (const provider of providers) {
      next = provider(context)
      if (next) break
    }
    setShape(next ?? hoveredCss)
  }

  function mouseInit(source: MouseEvent | null, extra: MouseEventInit = {}): MouseEventInit {
    return {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: window.screenX + x,
      screenY: window.screenY + y,
      buttons,
      ctrlKey: source?.ctrlKey ?? keys.ctrl,
      shiftKey: source?.shiftKey ?? keys.shift,
      altKey: source?.altKey ?? keys.alt,
      metaKey: source?.metaKey ?? keys.meta,
      ...extra,
    }
  }

  function dispatch(target: Element | null, type: string, source: MouseEvent | null, extra: MouseEventInit = {}): boolean {
    if (!target || !target.isConnected) return true
    return target.dispatchEvent(new MouseEvent(type, mouseInit(source, extra)))
  }

  /** The element chain from `el` up to the document (inclusive). */
  function ancestors(el: Element | null): Element[] {
    const chain: Element[] = []
    for (let node = el; node; node = node.parentElement) chain.push(node)
    return chain
  }

  // Hover: boundary events in the browser's order when the element under the cursor changes
  function updateHover(source: MouseEvent | null): void {
    const target = active ? document.elementFromPoint(x, y) : null
    if (target === hovered) return
    const previous = hovered && hovered.isConnected ? hovered : null
    hovered = target
    hoveredCss = cssShape(target)
    hideTitle()
    const oldChain = ancestors(previous)
    const newChain = ancestors(target)
    const shared = new Set(newChain.filter((el) => oldChain.includes(el)))
    if (previous) {
      dispatch(previous, 'mouseout', source, { relatedTarget: target })
      for (const el of oldChain) {
        if (shared.has(el)) break
        dispatch(el, 'mouseleave', source, { bubbles: false, cancelable: false, relatedTarget: target })
      }
    }
    if (target) {
      dispatch(target, 'mouseover', source, { relatedTarget: previous })
      const entered = newChain.filter((el) => !shared.has(el)).reverse()
      for (const el of entered) dispatch(el, 'mouseenter', source, { bubbles: false, cancelable: false, relatedTarget: previous })
      titleTimer = window.setTimeout(showTitle, TITLE_DELAY_MS)
    }
  }

  function showTitle(): void {
    const owner = hovered?.closest('[title]')
    const text = owner?.getAttribute('title')
    if (!active || !text) return
    titleTip.textContent = text
    titleTip.style.display = 'block'
    // Below-right of the arrow, kept on screen
    const rect = titleTip.getBoundingClientRect()
    const left = Math.min(x + 14, window.innerWidth - rect.width - 4)
    const top = y + 26 + rect.height > window.innerHeight ? y - rect.height - 6 : y + 26
    titleTip.style.left = `${Math.max(4, left)}px`
    titleTip.style.top = `${Math.max(4, top)}px`
  }

  function hideTitle(): void {
    window.clearTimeout(titleTimer)
    titleTip.style.display = 'none'
  }

  // Every frame while up: the shape follows what is under the cursor even when that changes on its own
  function tick(): void {
    if (!active) return
    updateShape()
    frame = requestAnimationFrame(tick)
  }

  function activate(): void {
    active = true
    x = Math.round(window.innerWidth / 2)
    y = Math.round(window.innerHeight / 2)
    buttons = 0
    cursor.style.display = 'block'
    updateHover(null)
    updateShape()
    place()
    dispatch(hovered, 'mousemove', null)
    frame = requestAnimationFrame(tick)
  }

  function deactivate(): void {
    active = false
    cancelAnimationFrame(frame)
    cursor.style.display = 'none'
    updateHover(null) // leaves whatever was hovered (hover highlights reset)
    buttons = 0
    pressedOn.length = 0
  }

  onPointerModeChange(() => {
    const shouldBeActive = isPointerLocked() && isCursorMenuOpen()
    if (shouldBeActive && !active) activate()
    else if (!shouldBeActive && active) deactivate()
    else if (active) updateHover(null) // another menu opened over the last one: same spot, new element under it
  })

  window.addEventListener('resize', () => {
    if (!active) return
    x = Math.min(x, window.innerWidth - 1)
    y = Math.min(y, window.innerHeight - 1)
    place()
  })

  // Modifier keys change the shape at once (Ctrl over an item: swap arrows), without waiting for a move
  const onKey = (event: KeyboardEvent): void => {
    keys.ctrl = event.ctrlKey
    keys.shift = event.shiftKey
    keys.alt = event.altKey
    keys.meta = event.metaKey
    updateShape()
  }
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('keyup', onKey, true)
  window.addEventListener('blur', () => {
    keys.ctrl = keys.shift = keys.alt = keys.meta = false
  })

  function onMove(event: MouseEvent): void {
    x = Math.max(0, Math.min(window.innerWidth - 1, x + (event.movementX || 0)))
    y = Math.max(0, Math.min(window.innerHeight - 1, y + (event.movementY || 0)))
    updateHover(event)
    dispatch(hovered, 'mousemove', event, { movementX: event.movementX, movementY: event.movementY })
    updateShape()
    place()
  }

  function onDown(event: MouseEvent): void {
    updateHover(event)
    hideTitle()
    buttons |= BUTTON_BITS[event.button] ?? 0
    pressedOn[event.button] = hovered
    const proceed = dispatch(hovered, 'mousedown', event, { button: event.button })
    // The browser's default: a press focuses the text field under it, or takes focus from one
    if (proceed && event.button === 0) focusUnder(hovered)
    updateShape()
  }

  function onUp(event: MouseEvent): void {
    updateHover(event)
    buttons &= ~(BUTTON_BITS[event.button] ?? 0)
    dispatch(hovered, 'mouseup', event, { button: event.button })
    // A click goes to the innermost element holding both the press and the release
    const pressed = pressedOn[event.button]
    pressedOn[event.button] = null
    if (event.button === 0 && pressed && pressed.isConnected && hovered) {
      let target: Element | null = hovered
      while (target && !target.contains(pressed)) target = target.parentElement
      if (target && !(target instanceof HTMLButtonElement && target.disabled)) {
        dispatch(target, 'click', event, { button: 0, detail: 1 })
      }
    }
    updateShape()
  }

  function onWheel(event: WheelEvent): void {
    updateHover(event)
    if (!hovered) return
    const init: WheelEventInit = {
      ...mouseInit(event),
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      deltaMode: event.deltaMode,
    }
    if (!hovered.dispatchEvent(new WheelEvent('wheel', init))) return
    // The browser's default: scroll the nearest scrollable box under the cursor
    const pixels = (delta: number, box: Element): number =>
      event.deltaMode === 1 ? delta * 16 : event.deltaMode === 2 ? delta * box.clientHeight : delta
    for (let el: Element | null = hovered; el; el = el.parentElement) {
      if (event.deltaY !== 0 && canScroll(el, 'y')) {
        el.scrollTop += pixels(event.deltaY, el)
        return
      }
      if (event.deltaX !== 0 && canScroll(el, 'x')) {
        el.scrollLeft += pixels(event.deltaX, el)
        return
      }
    }
  }

  const onCaptured = (event: Event): void => {
    if (!active || !event.isTrusted) return
    event.stopImmediatePropagation()
    if (event instanceof MouseEvent) {
      keys.ctrl = event.ctrlKey
      keys.shift = event.shiftKey
      keys.alt = event.altKey
      keys.meta = event.metaKey
    }
    switch (event.type) {
      case 'mousemove':
        onMove(event as MouseEvent)
        break
      case 'mousedown':
        event.preventDefault()
        onDown(event as MouseEvent)
        break
      case 'mouseup':
        onUp(event as MouseEvent)
        break
      case 'wheel':
        event.preventDefault()
        onWheel(event as WheelEvent)
        break
      case 'contextmenu':
        event.preventDefault()
        break
    }
  }
  for (const type of CAPTURED) window.addEventListener(type, onCaptured, { capture: true, passive: false })
}

/** The shape the element's CSS asks for: buttons and rows set `cursor: pointer`; text fields get an I-beam. */
function cssShape(target: Element | null): CursorShape {
  if (!target) return 'arrow'
  switch (getComputedStyle(target).cursor) {
    case 'pointer':
      return 'pointer'
    case 'text':
      return 'text'
    case 'grab':
      return 'grab'
    case 'grabbing':
      return 'grabbing'
    case 'move':
    case 'copy':
    case 'alias':
      return 'transfer'
    case 'auto':
      if (target instanceof HTMLTextAreaElement) return 'text'
      if (target instanceof HTMLInputElement && /^(text|search|email|number|password|url|tel)$/.test(target.type)) return 'text'
      return 'arrow'
    default:
      return 'arrow'
  }
}

function focusUnder(target: Element | null): void {
  const field = target?.closest(TEXT_FIELD)
  if (field instanceof HTMLElement) {
    field.focus({ preventScroll: true })
    return
  }
  const focused = document.activeElement
  if (focused instanceof HTMLElement && focused.matches(TEXT_FIELD)) focused.blur()
}

function canScroll(el: Element, axis: 'x' | 'y'): boolean {
  const overflow = getComputedStyle(el)[axis === 'y' ? 'overflowY' : 'overflowX']
  if (overflow !== 'auto' && overflow !== 'scroll') return false
  return axis === 'y' ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1
}

/** One cursor shape at `scale` device pixels per art pixel, with its drop shadow baked in (no CSS filter to redo). */
function drawSprite(art: string[], scale: number): HTMLCanvasElement {
  const width = art[0].length
  const height = art.length
  const canvas = document.createElement('canvas')
  canvas.width = (width + 1) * scale
  canvas.height = (height + 1) * scale
  const g = canvas.getContext('2d')!
  for (const pass of ['shadow', 'art'] as const) {
    const offset = pass === 'shadow' ? scale : 0
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const cell = art[row][col]
        if (cell === '.') continue
        g.fillStyle = pass === 'shadow' ? SHADOW : cell === 'B' ? OUTLINE : FILL
        g.fillRect(col * scale + offset, row * scale + offset, scale, scale)
      }
    }
  }
  return canvas
}

function createCursorElement(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const style = canvas.style
  style.position = 'fixed'
  style.left = '0'
  style.top = '0'
  style.pointerEvents = 'none'
  style.zIndex = '2147483647'
  style.display = 'none'
  style.willChange = 'transform'
  style.imageRendering = 'pixelated'
  return canvas
}

function createTitleTip(): HTMLDivElement {
  // Styled like the inventory's item tooltip (DragDropHandler)
  const tip = document.createElement('div')
  const style = tip.style
  style.position = 'fixed'
  style.display = 'none'
  style.maxWidth = '320px'
  style.padding = '4px 8px'
  style.background = 'rgba(20, 20, 20, 0.95)'
  style.border = '1px solid rgba(255, 255, 255, 0.3)'
  style.borderRadius = '4px'
  style.color = 'rgba(255, 255, 255, 0.95)'
  style.fontSize = `${12 * UI_SCALE}px`
  style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  style.pointerEvents = 'none'
  style.zIndex = '2147483646'
  return tip
}
