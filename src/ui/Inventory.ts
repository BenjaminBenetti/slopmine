import type { IItemStack } from '../player/PlayerState.ts'
import { syncSlotsFromState } from './SlotRenderer.ts'
import { applyUIScale, UI_SCALE } from './uiScale.ts'
import { getHudToolbarTop } from './hudLayout.ts'

export interface InventoryUIOptions {
  columns?: number
  rows?: number
  slotSizePx?: number
}

/** Callback for when recipe book toggle is clicked */
export type RecipeBookToggleCallback = (showRecipeBook: boolean) => void

export interface InventoryUI {
  readonly root: HTMLDivElement
  readonly panel: HTMLDivElement
  readonly contentWrapper: HTMLDivElement
  readonly gridContainer: HTMLDivElement
  readonly slots: HTMLDivElement[]
  readonly isOpen: boolean
  /** Whether recipe book is currently shown instead of crafting panel */
  readonly isRecipeBookOpen: boolean
  open(): void
  close(): void
  toggle(): void
  destroy(): void
  syncFromState(stateSlots: ReadonlyArray<IItemStack | null>): void
  /** Set callback for recipe book toggle button clicks */
  onRecipeBookToggle(callback: RecipeBookToggleCallback): void
  /** Programmatically toggle recipe book view */
  setRecipeBookOpen(open: boolean): void
  /** Place a panel left of the slot grid, inside the grid container (e.g. armor slots) */
  attachBesideGrid(element: HTMLElement): void
}

/** Screen px kept free around the panel (viewport edges, raised toolbar). */
const PANEL_MARGIN = 12
/** Smallest zoom the panel shrinks to; below it the panel scrolls instead. */
const MIN_PANEL_ZOOM = 0.6

/**
 * Grid-based inventory overlay.
 * Centered on screen with a semi-transparent backdrop, styled
 * similarly to the toolbar slots.
 *
 * The panel (grid + whatever sits beside it: crafting, recipe book, a block
 * UI such as a chest or the Hellforge) is centred in the space above the
 * toolbar, which stays raised above the overlay as a drop target. When it
 * does not fit at the UI scale it shrinks (CSS zoom, so slots, hit-testing
 * and drag-drop scale together) - it never runs off-screen or under the
 * toolbar.
 */
export function createInventoryUI(
  parent: HTMLElement = document.body,
  options: InventoryUIOptions = {},
): InventoryUI {
  const columns = options.columns ?? 10
  const rows = options.rows ?? 8
  const slotSize = options.slotSizePx ?? 44

  const overlay = document.createElement('div')
  overlay.style.position = 'fixed'
  overlay.style.inset = '0'
  overlay.style.display = 'none'
  overlay.style.alignItems = 'center'
  overlay.style.justifyContent = 'center'
  overlay.style.background = 'rgba(0, 0, 0, 0.45)'
  overlay.style.zIndex = '35'
  overlay.style.boxSizing = 'border-box'
  // Overflow (only below MIN_PANEL_ZOOM) stays reachable at the top-left
  overlay.style.alignItems = 'safe center'
  overlay.style.justifyContent = 'safe center'

  const panel = document.createElement('div')
  applyUIScale(panel)
  let panelZoom = UI_SCALE
  // Never squeezed by the viewport: it keeps its natural size, which
  // fitPanel measures and scales down instead
  panel.style.flex = '0 0 auto'
  // Safeguard below MIN_PANEL_ZOOM: the panel scrolls instead of overflowing
  // (max-height is set in fitPanel, in CSS px inside the zoom)
  panel.style.overflowY = 'auto'

  // Content wrapper for horizontal layout (sidebar + inventory grid + crafting panel)
  const contentWrapper = document.createElement('div')
  contentWrapper.style.display = 'flex'
  contentWrapper.style.gap = '0.5rem'
  contentWrapper.style.alignItems = 'flex-start'

  // Sidebar for toggle buttons (left of inventory grid)
  const sidebar = document.createElement('div')
  sidebar.style.display = 'flex'
  sidebar.style.flexDirection = 'column'
  sidebar.style.gap = '0.5rem'
  sidebar.style.alignSelf = 'stretch'

  // Recipe book toggle button
  const recipeBookBtn = document.createElement('button')
  recipeBookBtn.title = 'Recipe Book'
  recipeBookBtn.style.width = '36px'
  recipeBookBtn.style.height = '36px'
  recipeBookBtn.style.padding = '0'
  recipeBookBtn.style.background = 'rgba(12, 12, 12, 0.96)'
  recipeBookBtn.style.border = '2px solid rgba(255, 255, 255, 0.25)'
  recipeBookBtn.style.borderRadius = '6px'
  recipeBookBtn.style.cursor = 'pointer'
  recipeBookBtn.style.display = 'flex'
  recipeBookBtn.style.alignItems = 'center'
  recipeBookBtn.style.justifyContent = 'center'
  recipeBookBtn.style.transition = 'background 0.15s, border-color 0.15s'
  recipeBookBtn.style.fontSize = '18px'
  recipeBookBtn.textContent = '\u{1F4D6}' // Book emoji

  recipeBookBtn.addEventListener('mouseenter', () => {
    recipeBookBtn.style.background = 'rgba(40, 40, 40, 0.96)'
  })
  recipeBookBtn.addEventListener('mouseleave', () => {
    if (!recipeBookOpen) {
      recipeBookBtn.style.background = 'rgba(12, 12, 12, 0.96)'
      recipeBookBtn.style.borderColor = 'rgba(255, 255, 255, 0.25)'
    }
  })

  sidebar.appendChild(recipeBookBtn)
  contentWrapper.appendChild(sidebar)

  // Grid container with its own styling
  const gridContainer = document.createElement('div')
  gridContainer.style.background = 'rgba(12, 12, 12, 0.96)'
  gridContainer.style.borderRadius = '8px'
  gridContainer.style.border = '2px solid rgba(255, 255, 255, 0.18)'
  gridContainer.style.padding = '1rem 1.25rem'

  const grid = document.createElement('div')
  grid.style.display = 'grid'
  grid.style.gridTemplateColumns = `repeat(${columns}, ${slotSize}px)`
  grid.style.gap = '0.4rem'

  const slots: HTMLDivElement[] = []

  for (let i = 0; i < columns * rows; i += 1) {
    const slot = document.createElement('div')
    slot.style.width = `${slotSize}px`
    slot.style.height = `${slotSize}px`
    slot.style.background = 'rgba(8, 8, 8, 0.98)'
    slot.style.border = '2px solid rgba(255, 255, 255, 0.35)'
    slot.style.borderRadius = '4px'
    slot.style.boxShadow = 'inset 0 0 0 1px rgba(0, 0, 0, 0.7)'
    slot.style.display = 'flex'
    slot.style.alignItems = 'center'
    slot.style.justifyContent = 'center'
    slot.style.position = 'relative'

    slots.push(slot)
    grid.appendChild(slot)
  }

  // Row holding side panels (armor slots) to the left of the grid
  const gridRow = document.createElement('div')
  gridRow.style.display = 'flex'
  gridRow.style.gap = '0.9rem'
  gridRow.style.alignItems = 'flex-start'
  gridRow.appendChild(grid)

  gridContainer.appendChild(gridRow)
  contentWrapper.appendChild(gridContainer)
  panel.appendChild(contentWrapper)
  overlay.appendChild(panel)
  parent.appendChild(overlay)

  let open = false
  let recipeBookOpen = false
  let recipeBookToggleCallback: RecipeBookToggleCallback | null = null

  /**
   * Centre the panel above the toolbar and shrink it to fit the viewport
   * (never grows past UI_SCALE). Runs on open, on resize and whenever the
   * panel's content changes size (block UI mounted, recipe book toggled).
   */
  const fitPanel = (): void => {
    if (!open) return
    const toolbarTop = getHudToolbarTop()
    overlay.style.paddingBottom = `${Math.max(0, Math.round(window.innerHeight - toolbarTop))}px`
    const availableW = window.innerWidth - 2 * PANEL_MARGIN
    const availableH = toolbarTop - 2 * PANEL_MARGIN
    const rect = contentWrapper.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || availableW <= 0 || availableH <= 0) return
    // Size at the full UI scale (rects are in screen px, i.e. CSS px x zoom)
    const naturalW = (rect.width / panelZoom) * UI_SCALE
    const naturalH = (rect.height / panelZoom) * UI_SCALE
    const fit = Math.min(UI_SCALE, (UI_SCALE * availableW) / naturalW, (UI_SCALE * availableH) / naturalH)
    const zoom = Math.max(MIN_PANEL_ZOOM, Math.floor(fit * 100) / 100)
    if (Math.abs(zoom - panelZoom) > 0.005) {
      panelZoom = zoom
      panel.style.setProperty('zoom', String(zoom))
    }
    panel.style.maxHeight = `${Math.floor(availableH / panelZoom)}px`
  }
  // Content size changes (block UIs, recipe book, crafting list) refit the panel
  const contentObserver = new ResizeObserver(() => fitPanel())
  contentObserver.observe(contentWrapper)
  window.addEventListener('resize', fitPanel)

  const applyVisibility = (): void => {
    overlay.style.display = open ? 'flex' : 'none'
    fitPanel()
  }

  const updateRecipeBookButtonStyle = (): void => {
    if (recipeBookOpen) {
      recipeBookBtn.style.background = 'rgba(60, 80, 120, 0.96)'
      recipeBookBtn.style.borderColor = 'rgba(100, 150, 255, 0.6)'
    } else {
      recipeBookBtn.style.background = 'rgba(12, 12, 12, 0.96)'
      recipeBookBtn.style.borderColor = 'rgba(255, 255, 255, 0.25)'
    }
  }

  recipeBookBtn.addEventListener('click', () => {
    recipeBookOpen = !recipeBookOpen
    updateRecipeBookButtonStyle()
    recipeBookToggleCallback?.(recipeBookOpen)
  })

  const api: InventoryUI = {
    root: overlay,
    panel,
    contentWrapper,
    gridContainer,
    slots,
    get isOpen() {
      return open
    },
    get isRecipeBookOpen() {
      return recipeBookOpen
    },
    open(): void {
      open = true
      applyVisibility()
    },
    close(): void {
      open = false
      applyVisibility()
    },
    toggle(): void {
      open = !open
      applyVisibility()
    },
    destroy(): void {
      contentObserver.disconnect()
      window.removeEventListener('resize', fitPanel)
      if (overlay.parentElement === parent) {
        parent.removeChild(overlay)
      }
    },
    syncFromState(stateSlots: ReadonlyArray<IItemStack | null>): void {
      syncSlotsFromState(slots, stateSlots)
    },
    onRecipeBookToggle(callback: RecipeBookToggleCallback): void {
      recipeBookToggleCallback = callback
    },
    setRecipeBookOpen(openBook: boolean): void {
      recipeBookOpen = openBook
      updateRecipeBookButtonStyle()
      recipeBookToggleCallback?.(recipeBookOpen)
    },
    attachBesideGrid(element: HTMLElement): void {
      gridRow.insertBefore(element, grid)
    },
  }

  applyVisibility()
  return api
}

