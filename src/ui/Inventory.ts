import type { IItemStack } from '../player/PlayerState.ts'
import { syncSlotsFromState } from './SlotRenderer.ts'
import { applyUIScale } from './uiScale.ts'

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
}

/**
 * Grid-based inventory overlay.
 * Centered on screen with a semi-transparent backdrop, styled
 * similarly to the toolbar slots.
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

  const panel = document.createElement('div')
  applyUIScale(panel)
  // Safeguard for small viewports: the scaled panel scrolls instead of
  // overflowing offscreen (vh here resolves against the zoom-adjusted viewport)
  panel.style.maxHeight = '92vh'
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
  grid.style.gridTemplateColumns = `repeat(${columns}, min(${slotSize}px, 5vw))`
  grid.style.gap = '0.4rem'

  const slots: HTMLDivElement[] = []

  for (let i = 0; i < columns * rows; i += 1) {
    const slot = document.createElement('div')
    slot.style.width = `min(${slotSize}px, 5vw)`
    slot.style.height = `min(${slotSize}px, 5vw)`
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

  gridContainer.appendChild(grid)
  contentWrapper.appendChild(gridContainer)
  panel.appendChild(contentWrapper)
  overlay.appendChild(panel)
  parent.appendChild(overlay)

  let open = false
  let recipeBookOpen = false
  let recipeBookToggleCallback: RecipeBookToggleCallback | null = null

  const applyVisibility = (): void => {
    overlay.style.display = open ? 'flex' : 'none'
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
  }

  applyVisibility()
  return api
}

