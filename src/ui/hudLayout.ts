import { applyUIScale, UI_SCALE } from './uiScale.ts'

/**
 * Shared HUD layout: the screen anchors every HUD element mounts into, so
 * elements from different systems stack instead of overlapping.
 *
 *   top-left       journal goal line, then the status effect badges
 *   top-centre     boss bar, then the Sigil Compass plaque
 *   top-right      toasts
 *   bottom-centre  hearts (+ armor row), then action-bar messages above them
 *                  (the toolbar sits below at `bottom: 2.5%`)
 *
 * Each anchor is a *slot*: a fixed, UI-scaled, pointer-transparent flex
 * column. Elements mount into a slot with an order (`HudOrder`) and are laid
 * out statically inside it - no element positions itself. Units are CSS px
 * before the UI scale ("HUD px"), like every other zoomed HUD root.
 *
 * Column widths: the top-centre column gets up to `CENTER_MAX_WIDTH` (the boss
 * bar's design width) and gives way down to `CENTER_MIN_WIDTH` on narrow
 * windows, so the side columns always keep `SIDE_MIN_WIDTH`; side content is
 * width-capped (ellipsis / wrapping), so the three columns never meet.
 *
 * Obstacles: screen rects other overlays register (the debug overlay's stats
 * and mini-map). A top slot whose column overlaps an obstacle horizontally
 * starts below it (the toast column only as far as it keeps room for a toast
 * above the bottom HUD).
 */

export type HudSlotName = 'topLeft' | 'topCenter' | 'topRight' | 'bottomCenter'

/** Inset of every slot from the screen edge (HUD px). */
const HUD_EDGE_MARGIN = 10
/** Space between elements stacked in one slot (HUD px). */
const HUD_STACK_GAP = 6
/** Minimum space between the top columns (HUD px). */
const HUD_COLUMN_GAP = 14

/**
 * The top columns own the screen down to this fraction of its height; the
 * bottom HUD (hearts, armor, action bar, toolbar) lives below it.
 */
const TOP_BAND_FRACTION = 0.62
/** Room (HUD px) the toast column keeps inside the top band, even under a tall debug overlay. */
const TOAST_MIN_ROOM = 80

const CENTER_MAX_WIDTH = 440
const CENTER_MIN_WIDTH = 240
const SIDE_MIN_WIDTH = 220
const TOAST_MAX_WIDTH = 300

/** HUD z-index layers (see CLAUDE.md: 25 toolbar, 30 HUD, 35 inventory overlay, 40 raised toolbar). */
export const HudZ = {
  /** Hearts/armor and action-bar messages, under the crosshair and the HUD */
  BOTTOM_HUD: 26,
  /** Top HUD columns (journal line, effects, boss bar, compass) */
  HUD: 30,
  /**
   * Toasts sit above the HUD but UNDER open panels (inventory 35, journal 45):
   * milestone toasts fire while crafting, and must not cover the grid
   */
  TOASTS: 34,
} as const

/** Order of elements inside their slot (lower = first: topmost, or bottom-most in bottomCenter). */
export const HudOrder = {
  JOURNAL_GOAL: 0,
  STATUS_EFFECTS: 1,
  BOSS_BAR: 0,
  SIGIL_COMPASS: 1,
  TOASTS: 0,
  HEARTS: 0,
  PLAYER_NOTICE: 1,
  STATUS_MESSAGE: 2,
} as const

/** Bottom of the hearts stack: 70 HUD px above the toolbar's 2.5% inset. */
const BOTTOM_CENTER_OFFSET = 'calc(2.5% + 70px)'

const slots = new Map<HudSlotName, HTMLDivElement>()
const obstacles = new Map<string, DOMRectReadOnly>()
const layoutListeners = new Set<() => void>()
let toolbar: HTMLElement | null = null
let layoutQueued = false
let listening = false

function createSlot(name: HudSlotName): HTMLDivElement {
  const el = document.createElement('div')
  el.dataset.hudSlot = name
  Object.assign(el.style, {
    position: 'fixed',
    display: 'flex',
    flexDirection: name === 'bottomCenter' ? 'column-reverse' : 'column',
    gap: `${HUD_STACK_GAP}px`,
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: String(name === 'topRight' ? HudZ.TOASTS : name === 'bottomCenter' ? HudZ.BOTTOM_HUD : HudZ.HUD),
  } satisfies Partial<CSSStyleDeclaration>)
  switch (name) {
    case 'topLeft':
      el.style.left = `${HUD_EDGE_MARGIN}px`
      el.style.alignItems = 'flex-start'
      break
    case 'topCenter':
      el.style.left = '50%'
      el.style.transform = 'translateX(-50%)'
      el.style.alignItems = 'center'
      break
    case 'topRight':
      el.style.right = `${HUD_EDGE_MARGIN}px`
      el.style.alignItems = 'stretch'
      break
    case 'bottomCenter':
      el.style.left = '50%'
      el.style.bottom = BOTTOM_CENTER_OFFSET
      el.style.transform = 'translateX(-50%)'
      el.style.alignItems = 'center'
      break
  }
  applyUIScale(el)
  document.body.appendChild(el)
  return el
}

function listenForResize(): void {
  if (listening) return
  listening = true
  window.addEventListener('resize', requestHudLayout)
}

function getSlot(name: HudSlotName): HTMLDivElement {
  let slot = slots.get(name)
  if (!slot) {
    slot = createSlot(name)
    slots.set(name, slot)
    listenForResize()
    layoutNow()
  }
  return slot
}

/**
 * Mount a HUD element into a slot at `order`. The element must not position
 * itself (no fixed position, offsets or UI zoom - the slot carries those).
 * A `parent` other than document.body (embedding, tests) takes the element
 * as-is instead.
 */
export function mountHudElement(element: HTMLElement, slot: HudSlotName, order: number, parent?: HTMLElement): void {
  if (parent && parent !== document.body) {
    parent.appendChild(element)
    return
  }
  element.style.order = String(order)
  element.style.flex = '0 0 auto'
  getSlot(slot).appendChild(element)
}

/**
 * Register (or clear, with null) a screen rect (viewport px, e.g. from
 * getBoundingClientRect) that the top slots must stay below.
 */
export function setHudObstacle(id: string, rect: DOMRectReadOnly | null): void {
  const previous = obstacles.get(id)
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    if (!previous) return
    obstacles.delete(id)
  } else {
    if (
      previous &&
      previous.left === rect.left &&
      previous.right === rect.right &&
      previous.top === rect.top &&
      previous.bottom === rect.bottom
    ) {
      return
    }
    obstacles.set(id, rect)
  }
  requestHudLayout()
}

/** The toolbar element: panels kept open while the toolbar is raised above them stay clear of it. */
export function setHudToolbar(element: HTMLElement): void {
  toolbar = element
}

/** Top edge of the toolbar in viewport px (innerHeight when there is none or it is hidden). */
export function getHudToolbarTop(): number {
  if (!toolbar || !toolbar.isConnected || toolbar.style.display === 'none') return window.innerHeight
  const rect = toolbar.getBoundingClientRect()
  return rect.height > 0 ? rect.top : window.innerHeight
}

/** Recompute slot widths and offsets on the next frame (cheap; coalesced). */
function requestHudLayout(): void {
  if (layoutQueued) return
  layoutQueued = true
  requestAnimationFrame(() => {
    layoutQueued = false
    layoutNow()
  })
}

/**
 * Call `listener` after every relayout (resize, obstacle change), e.g. to
 * re-check what still fits. Returns an unsubscribe function.
 */
export function onHudLayout(listener: () => void): () => void {
  layoutListeners.add(listener)
  listenForResize()
  return () => {
    layoutListeners.delete(listener)
  }
}

/** Lowest viewport y (px) of the top band: stacked top-column content (toasts) stays above it. */
export function getHudTopBandBottom(): number {
  return window.innerHeight * TOP_BAND_FRACTION
}

/**
 * Horizontal extent of the top-centre column in viewport px (it does not
 * depend on obstacles), so a top-corner overlay can stay clear of it.
 */
export function getHudCenterColumnBounds(): { left: number; right: number } {
  const { center } = getColumnWidths()
  const half = (center * UI_SCALE) / 2
  return { left: window.innerWidth / 2 - half, right: window.innerWidth / 2 + half }
}

/** Gap kept between the top-centre column and a top-corner overlay, in viewport px. */
export const HUD_COLUMN_GAP_PX = HUD_COLUMN_GAP * UI_SCALE

/** Width of the top-centre column and of each side column, in HUD px. */
function getColumnWidths(): { center: number; side: number } {
  const width = window.innerWidth / UI_SCALE
  const sideReserve = SIDE_MIN_WIDTH + HUD_EDGE_MARGIN + HUD_COLUMN_GAP
  const center = Math.round(Math.max(CENTER_MIN_WIDTH, Math.min(CENTER_MAX_WIDTH, width - 2 * sideReserve)))
  const side = Math.max(140, Math.floor((width - center) / 2 - HUD_EDGE_MARGIN - HUD_COLUMN_GAP))
  return { center, side }
}

function layoutNow(): void {
  const width = window.innerWidth / UI_SCALE
  const { center, side } = getColumnWidths()
  const toastWidth = Math.min(TOAST_MAX_WIDTH, side)

  // Horizontal extent of each top column (HUD px)
  const spans: Array<[HudSlotName, number, number, number]> = [
    ['topLeft', HUD_EDGE_MARGIN, HUD_EDGE_MARGIN + side, side],
    ['topCenter', (width - center) / 2, (width + center) / 2, center],
    ['topRight', width - HUD_EDGE_MARGIN - toastWidth, width - HUD_EDGE_MARGIN, toastWidth],
  ]
  for (const [name, left, right, columnWidth] of spans) {
    const slot = slots.get(name)
    if (!slot) continue
    let top = HUD_EDGE_MARGIN
    for (const rect of obstacles.values()) {
      const oLeft = rect.left / UI_SCALE
      const oRight = rect.right / UI_SCALE
      if (oRight > left && oLeft < right) top = Math.max(top, rect.bottom / UI_SCALE + HUD_STACK_GAP)
    }
    if (name === 'topRight') {
      // On short windows a toast may cover the debug stats' last lines rather
      // than run into the hearts below the band
      top = Math.min(top, Math.max(HUD_EDGE_MARGIN, getHudTopBandBottom() / UI_SCALE - TOAST_MIN_ROOM))
    }
    slot.style.top = `${Math.round(top)}px`
    slot.style.width = `${columnWidth}px`
  }
  for (const listener of layoutListeners) listener()
}
