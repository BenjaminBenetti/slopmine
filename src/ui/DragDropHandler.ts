import type { IItem } from '../items/Item.ts'
import type { IItemStack, IToolbarState, IInventoryGridState } from '../player/PlayerState.ts'
import { renderStackInSlot } from './SlotRenderer.ts'

export interface DragDropSlotInfo {
  element: HTMLDivElement
  container: 'toolbar' | 'inventory'
  index: number
}

export interface DragDropOptions {
  toolbarState: IToolbarState
  inventoryState: IInventoryGridState
  toolbarRoot: HTMLDivElement
  toolbarSlots: HTMLDivElement[]
  inventoryRoot: HTMLDivElement
  inventorySlots: HTMLDivElement[]
  /** Called after any successful drop to sync UI with state */
  onStateChanged?: () => void
}

export interface DragDropHandler {
  /** Enable drag-drop (call when inventory opens) */
  enable(): void
  /** Disable drag-drop (call when inventory closes) */
  disable(): void
  /** Clean up all listeners */
  dispose(): void
}

export function createDragDropHandler(options: DragDropOptions): DragDropHandler {
  const {
    toolbarState,
    inventoryState,
    toolbarRoot,
    toolbarSlots,
    inventoryRoot,
    inventorySlots,
    onStateChanged,
  } = options

  let enabled = false
  let dragging = false
  let dragSource: DragDropSlotInfo | null = null
  let ghostElement: HTMLDivElement | null = null
  let tooltipElement: HTMLDivElement | null = null
  let hoveredSlot: DragDropSlotInfo | null = null

  // Build lookup map: element -> slot info
  const slotMap = new Map<HTMLDivElement, DragDropSlotInfo>()

  function buildSlotMap(): void {
    slotMap.clear()
    toolbarSlots.forEach((el, i) => {
      slotMap.set(el, { element: el, container: 'toolbar', index: i })
    })
    inventorySlots.forEach((el, i) => {
      slotMap.set(el, { element: el, container: 'inventory', index: i })
    })
  }

  function getStackFromSlot(info: DragDropSlotInfo): IItemStack | null {
    if (info.container === 'toolbar') {
      return toolbarState.getStack(info.index)
    }
    return inventoryState.getStack(info.index)
  }

  function setStackInSlot(info: DragDropSlotInfo, stack: IItemStack | null): void {
    if (info.container === 'toolbar') {
      toolbarState.setStack(info.index, stack)
    } else {
      inventoryState.setStack(info.index, stack)
    }
  }

  function createGhostElement(stack: IItemStack): HTMLDivElement {
    const ghost = document.createElement('div')
    ghost.style.position = 'fixed'
    ghost.style.width = '44px'
    ghost.style.height = '44px'
    ghost.style.pointerEvents = 'none'
    ghost.style.zIndex = '1000'
    ghost.style.opacity = '0.8'
    ghost.style.transform = 'translate(-50%, -50%)'

    if (stack.item.iconUrl) {
      const img = document.createElement('img')
      img.src = stack.item.iconUrl
      img.style.width = '100%'
      img.style.height = '100%'
      img.style.objectFit = 'contain'
      img.style.imageRendering = 'pixelated'
      img.draggable = false
      ghost.appendChild(img)
    }

    // Show count if more than 1
    if (stack.count > 1) {
      const countLabel = document.createElement('div')
      countLabel.textContent = String(stack.count)
      countLabel.style.position = 'absolute'
      countLabel.style.bottom = '2px'
      countLabel.style.right = '4px'
      countLabel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
      countLabel.style.fontSize = '0.7rem'
      countLabel.style.fontWeight = 'bold'
      countLabel.style.color = 'white'
      countLabel.style.textShadow = '1px 1px 1px rgba(0, 0, 0, 0.8), -1px -1px 1px rgba(0, 0, 0, 0.8)'
      countLabel.style.pointerEvents = 'none'
      ghost.appendChild(countLabel)
    }

    document.body.appendChild(ghost)
    return ghost
  }

  function updateGhostPosition(x: number, y: number): void {
    if (ghostElement) {
      ghostElement.style.left = `${x}px`
      ghostElement.style.top = `${y}px`
    }
  }

  function removeGhost(): void {
    if (ghostElement) {
      ghostElement.remove()
      ghostElement = null
    }
  }

  function createTooltip(text: string): HTMLDivElement {
    const tooltip = document.createElement('div')
    tooltip.style.position = 'fixed'
    tooltip.style.padding = '4px 8px'
    tooltip.style.background = 'rgba(20, 20, 20, 0.95)'
    tooltip.style.border = '1px solid rgba(255, 255, 255, 0.3)'
    tooltip.style.borderRadius = '4px'
    tooltip.style.color = 'rgba(255, 255, 255, 0.95)'
    tooltip.style.fontSize = '12px'
    tooltip.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
    tooltip.style.pointerEvents = 'none'
    tooltip.style.zIndex = '1001'
    tooltip.style.whiteSpace = 'nowrap'
    tooltip.textContent = text
    document.body.appendChild(tooltip)
    return tooltip
  }

  function updateTooltipPosition(x: number, y: number): void {
    if (tooltipElement) {
      tooltipElement.style.left = `${x + 12}px`
      tooltipElement.style.top = `${y + 12}px`
    }
  }

  function showTooltip(item: IItem, x: number, y: number): void {
    if (!tooltipElement) {
      tooltipElement = createTooltip(item.displayName)
    } else {
      tooltipElement.textContent = item.displayName
    }
    updateTooltipPosition(x, y)
  }

  function hideTooltip(): void {
    if (tooltipElement) {
      tooltipElement.remove()
      tooltipElement = null
    }
  }

  function findSlotUnderPoint(x: number, y: number): DragDropSlotInfo | null {
    const el = document.elementFromPoint(x, y)
    if (!el) return null

    // Check if it's a slot or child of a slot
    for (const [slotEl, info] of slotMap) {
      if (slotEl === el || slotEl.contains(el as Node)) {
        return info
      }
    }
    return null
  }

  function getSlotCenter(slot: HTMLDivElement): { x: number; y: number } {
    const rect = slot.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
  }

  function distanceSquared(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1
    const dy = y2 - y1
    return dx * dx + dy * dy
  }

  function isPointInElement(x: number, y: number, element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect()
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }

  function findClosestSlot(x: number, y: number): DragDropSlotInfo | null {
    // First try exact match
    const exact = findSlotUnderPoint(x, y)
    if (exact) return exact

    // Check if cursor is within toolbar or inventory area
    const inToolbar = isPointInElement(x, y, toolbarRoot)
    const inInventory = isPointInElement(x, y, inventoryRoot)

    if (!inToolbar && !inInventory) {
      return null
    }

    // Find closest slot from the relevant container(s)
    let closestSlot: DragDropSlotInfo | null = null
    let closestDistSq = Infinity

    for (const [slotEl, info] of slotMap) {
      // If in toolbar, only consider toolbar slots; if in inventory, only inventory slots
      if (inToolbar && info.container !== 'toolbar') continue
      if (inInventory && info.container !== 'inventory') continue

      const center = getSlotCenter(slotEl)
      const distSq = distanceSquared(x, y, center.x, center.y)

      if (distSq < closestDistSq) {
        closestDistSq = distSq
        closestSlot = info
      }
    }

    return closestSlot
  }

  function performSwap(
    source: DragDropSlotInfo,
    target: DragDropSlotInfo
  ): void {
    const sourceStack = getStackFromSlot(source)
    const targetStack = getStackFromSlot(target)

    setStackInSlot(source, targetStack)
    setStackInSlot(target, sourceStack)

    // Update UI for both slots
    renderStackInSlot(source.element, targetStack)
    renderStackInSlot(target.element, sourceStack)

    onStateChanged?.()
  }

  function cancelDrag(): void {
    if (dragging && dragSource) {
      dragSource.element.style.opacity = '1'
    }
    removeGhost()
    hideTooltip()
    dragging = false
    dragSource = null
  }

  // Event handlers
  function onMouseDown(event: MouseEvent): void {
    if (!enabled || event.button !== 0) return

    const slot = findSlotUnderPoint(event.clientX, event.clientY)
    if (!slot) return

    const stack = getStackFromSlot(slot)
    if (!stack) return

    event.preventDefault()

    // Hide tooltip when starting to drag
    hideTooltip()

    dragging = true
    dragSource = slot

    // Create ghost
    ghostElement = createGhostElement(stack)
    updateGhostPosition(event.clientX, event.clientY)

    // Dim source slot
    slot.element.style.opacity = '0.5'
  }

  function onMouseMove(event: MouseEvent): void {
    if (dragging) {
      updateGhostPosition(event.clientX, event.clientY)
      hideTooltip()
      return
    }

    // Handle tooltip on hover
    const slot = findSlotUnderPoint(event.clientX, event.clientY)
    if (slot) {
      const stack = getStackFromSlot(slot)
      if (stack) {
        hoveredSlot = slot
        showTooltip(stack.item, event.clientX, event.clientY)
        return
      }
    }

    // No item under cursor
    hoveredSlot = null
    hideTooltip()
  }

  function onMouseUp(event: MouseEvent): void {
    if (!dragging || !dragSource) {
      return
    }

    // Find closest slot if dropped within inventory/toolbar area
    const targetSlot = findClosestSlot(event.clientX, event.clientY)

    // Restore source slot opacity
    dragSource.element.style.opacity = '1'

    // Perform swap if valid target (different from source)
    if (targetSlot && (targetSlot.container !== dragSource.container || targetSlot.index !== dragSource.index)) {
      performSwap(dragSource, targetSlot)
    }

    // Cleanup
    removeGhost()
    dragging = false
    dragSource = null
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Escape' && dragging) {
      cancelDrag()
    }
  }

  function enableSlotPointerEvents(enable: boolean): void {
    const value = enable ? 'auto' : 'none'
    // Enable toolbar root so events can reach slots
    toolbarRoot.style.pointerEvents = value
    // Raise toolbar above inventory overlay (z-index 35) when enabled
    toolbarRoot.style.zIndex = enable ? '40' : '25'
    toolbarSlots.forEach(slot => { slot.style.pointerEvents = value })
    inventorySlots.forEach(slot => { slot.style.pointerEvents = value })
  }

  return {
    enable(): void {
      if (enabled) return
      enabled = true
      buildSlotMap()
      enableSlotPointerEvents(true)

      document.addEventListener('mousedown', onMouseDown)
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      window.addEventListener('keydown', onKeyDown)
    },

    disable(): void {
      if (!enabled) return
      enabled = false
      enableSlotPointerEvents(false)

      // Cancel any in-progress drag and hide tooltip
      cancelDrag()
      hideTooltip()
      hoveredSlot = null

      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKeyDown)
    },

    dispose(): void {
      this.disable()
      slotMap.clear()
    }
  }
}
