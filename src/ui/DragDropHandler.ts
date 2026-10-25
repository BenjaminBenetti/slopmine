import type { IItem } from '../items/Item.ts'
import type { IItemStack, IToolbarState, IInventoryGridState } from '../player/PlayerState.ts'
import type { ICraftingState } from '../crafting/CraftingState.ts'
import { renderStackInSlot } from './SlotRenderer.ts'
import { UI_SCALE } from './uiScale.ts'
import { playSound } from '../audio/SoundHooks.ts'
import { addCursorShapeProvider, type CursorContext, type CursorShape } from './VirtualCursor.ts'

export interface DragDropSlotInfo {
  element: HTMLDivElement
  container: 'toolbar' | 'inventory' | 'crafting' | 'extra'
  index: number
  /** The extra container (container === 'extra') */
  extra?: DragDropExtraContainer
}

/**
 * An extra slot container added with `addContainer` (e.g. worn armor):
 * slots that only accept some items. Ctrl/shift+click on one of its slots
 * moves the stack back to the player; shift+click on a player slot holding
 * an item it takes (`quickTarget`) moves the item in, swapping out the
 * previous stack.
 */
export interface DragDropExtraContainer {
  /** Element enclosing the slots (drops inside it snap to its nearest slot) */
  readonly root: HTMLElement
  readonly slots: HTMLDivElement[]
  getStack(index: number): IItemStack | null
  setStack(index: number, stack: IItemStack | null): void
  /** Whether `item` may go into slot `index` */
  accepts(index: number, item: IItem): boolean
  /** Slot that shift+click quick-places `item` into, or -1 */
  quickTarget?(item: IItem): number
}

export interface DragDropOptions {
  toolbarState: IToolbarState
  inventoryState: IInventoryGridState
  craftingState?: ICraftingState
  toolbarRoot: HTMLDivElement
  toolbarSlots: HTMLDivElement[]
  inventoryRoot: HTMLDivElement
  inventorySlots: HTMLDivElement[]
  craftingRoot?: HTMLDivElement
  craftingSlots?: HTMLDivElement[]
  /**
   * Ctrl+click on a toolbar/inventory slot moves the stack into the crafting
   * container while it is shown (the player's crafting grid, a chest, a
   * bench...). When false - or the container is hidden (the recipe book
   * replaces the crafting grid) - ctrl+click transfers between toolbar and
   * inventory. Crafting slots always quick-transfer back to the player
   * (inventory first, then the toolbar).
   */
  quickTransferIntoCrafting?: boolean
  /** Per-slot filter for quick transfers into the crafting container */
  craftingSlotAccepts?: (index: number, item: IItem) => boolean
  /** Called after any successful drop to sync UI with state */
  onStateChanged?: () => void
  /**
   * Called when a dragged stack is released outside every slot area
   * (over the game world). Return true if the stack was taken (thrown
   * into the world); false/undefined returns the items to their source
   * slot as before.
   */
  onDropOutside?: (stack: IItemStack) => boolean
}

export interface DragDropHandler {
  /** Enable drag-drop (call when inventory opens) */
  enable(): void
  /** Disable drag-drop (call when inventory closes) */
  disable(): void
  /** Add an extra slot container (see DragDropExtraContainer) */
  addContainer(container: DragDropExtraContainer): void
  /** Clean up all listeners */
  dispose(): void
}

export function createDragDropHandler(options: DragDropOptions): DragDropHandler {
  const {
    toolbarState,
    inventoryState,
    craftingState,
    toolbarRoot,
    toolbarSlots,
    inventoryRoot,
    inventorySlots,
    craftingRoot,
    craftingSlots,
    quickTransferIntoCrafting,
    craftingSlotAccepts,
    onStateChanged,
    onDropOutside,
  } = options

  let enabled = false
  let dragging = false
  let dragSource: DragDropSlotInfo | null = null
  let draggedStack: IItemStack | null = null // The actual items being dragged (may be partial)
  let ghostElement: HTMLDivElement | null = null
  let tooltipElement: HTMLDivElement | null = null
  let hoveredSlot: DragDropSlotInfo | null = null
  let removeCursorShape: (() => void) | null = null

  // Build lookup map: element -> slot info
  const slotMap = new Map<HTMLDivElement, DragDropSlotInfo>()
  const extraContainers: DragDropExtraContainer[] = []

  function buildSlotMap(): void {
    slotMap.clear()
    toolbarSlots.forEach((el, i) => {
      slotMap.set(el, { element: el, container: 'toolbar', index: i })
    })
    inventorySlots.forEach((el, i) => {
      slotMap.set(el, { element: el, container: 'inventory', index: i })
    })
    if (craftingSlots) {
      craftingSlots.forEach((el, i) => {
        slotMap.set(el, { element: el, container: 'crafting', index: i })
      })
    }
    for (const extra of extraContainers) {
      extra.slots.forEach((el, i) => {
        slotMap.set(el, { element: el, container: 'extra', index: i, extra })
      })
    }
  }

  /** Whether `item` may be put into the slot (extra containers filter). */
  function slotAccepts(info: DragDropSlotInfo, item: IItem): boolean {
    return !info.extra || info.extra.accepts(info.index, item)
  }

  function getStackFromSlot(info: DragDropSlotInfo): IItemStack | null {
    if (info.container === 'toolbar') {
      return toolbarState.getStack(info.index)
    }
    if (info.container === 'crafting' && craftingState) {
      return craftingState.getStack(info.index)
    }
    if (info.extra) {
      return info.extra.getStack(info.index)
    }
    return inventoryState.getStack(info.index)
  }

  function setStackInSlot(info: DragDropSlotInfo, stack: IItemStack | null): void {
    if (info.container === 'toolbar') {
      toolbarState.setStack(info.index, stack)
    } else if (info.container === 'crafting' && craftingState) {
      craftingState.setStack(info.index, stack)
    } else if (info.extra) {
      info.extra.setStack(info.index, stack)
    } else {
      inventoryState.setStack(info.index, stack)
    }
  }

  function createGhostElement(stack: IItemStack): HTMLDivElement {
    // Sized (not zoomed) by UI_SCALE: the ghost is positioned with raw
    // cursor coordinates, which CSS zoom would reinterpret in scaled units
    const ghost = document.createElement('div')
    ghost.style.position = 'fixed'
    ghost.style.width = `${44 * UI_SCALE}px`
    ghost.style.height = `${44 * UI_SCALE}px`
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
      countLabel.style.fontSize = `${0.7 * UI_SCALE}rem`
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
    tooltip.style.fontSize = `${12 * UI_SCALE}px`
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

    // Inside an extra container (which may sit inside the inventory panel):
    // snap to its nearest slot
    for (const extra of extraContainers) {
      if (!isPointInElement(x, y, extra.root)) continue
      let nearestIndex = -1
      let nearestDistSq = Infinity
      for (let i = 0; i < extra.slots.length; i++) {
        const center = getSlotCenter(extra.slots[i])
        const distSq = distanceSquared(x, y, center.x, center.y)
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq
          nearestIndex = i
        }
      }
      if (nearestIndex >= 0) {
        return { element: extra.slots[nearestIndex], container: 'extra', index: nearestIndex, extra }
      }
    }

    // Check if cursor is within toolbar, inventory, or crafting area. The
    // crafting / block UI panel sits inside the inventory panel: it wins
    // (both matching would skip every slot)
    const inToolbar = isPointInElement(x, y, toolbarRoot)
    const inCrafting = craftingRoot ? isPointInElement(x, y, craftingRoot) : false
    const inInventory = !inCrafting && isPointInElement(x, y, inventoryRoot)

    if (!inToolbar && !inInventory && !inCrafting) {
      return null
    }

    // Find closest slot from the relevant container(s)
    let closestSlot: DragDropSlotInfo | null = null
    let closestDistSq = Infinity

    for (const [slotEl, info] of slotMap) {
      // Only consider slots from the container the cursor is in
      if (info.container === 'extra') continue
      if (inToolbar && info.container !== 'toolbar') continue
      if (inInventory && info.container !== 'inventory') continue
      if (inCrafting && info.container !== 'crafting') continue

      const center = getSlotCenter(slotEl)
      const distSq = distanceSquared(x, y, center.x, center.y)

      if (distSq < closestDistSq) {
        closestDistSq = distSq
        closestSlot = info
      }
    }

    return closestSlot
  }

  /** Whether (x, y) is over a slot panel: a release there never throws the stack out. */
  function isOverPanel(x: number, y: number): boolean {
    return (
      isPointInElement(x, y, toolbarRoot) ||
      isPointInElement(x, y, inventoryRoot) ||
      (craftingRoot !== undefined && isPointInElement(x, y, craftingRoot)) ||
      extraContainers.some((extra) => isPointInElement(x, y, extra.root))
    )
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

  /**
   * Return items to the source slot, merging with any existing items there.
   */
  function returnToSource(source: DragDropSlotInfo, stack: IItemStack): void {
    const current = getStackFromSlot(source)
    if (current && current.item.id === stack.item.id) {
      // Merge with existing
      const newCount = current.count + stack.count
      setStackInSlot(source, { item: stack.item, count: newCount })
      renderStackInSlot(source.element, { item: stack.item, count: newCount })
    } else if (!current) {
      // Source is empty, place stack
      setStackInSlot(source, stack)
      renderStackInSlot(source.element, stack)
    } else if (!onDropOutside?.(stack)) {
      // Source refilled with a different item meanwhile (e.g. a pickup):
      // the stack was thrown out rather than lost (warn if it could not be)
      console.warn('Cannot return to source - different item in slot')
    }
  }

  /**
   * Handle dropping items on a target slot with merge/swap logic.
   */
  function performDrop(
    source: DragDropSlotInfo,
    target: DragDropSlotInfo,
    dragged: IItemStack
  ): void {
    const targetStack = getStackFromSlot(target)

    // Filtered slots: the dragged stack must fit the target, and a swapped-out
    // target stack must fit the source
    if (
      !slotAccepts(target, dragged.item) ||
      (targetStack && targetStack.item.id !== dragged.item.id && !slotAccepts(source, targetStack.item))
    ) {
      returnToSource(source, dragged)
      onStateChanged?.()
      return
    }

    if (!targetStack) {
      // Empty target: just place the dragged stack
      setStackInSlot(target, dragged)
      renderStackInSlot(target.element, dragged)
    } else if (targetStack.item.id === dragged.item.id) {
      // Same item type: try to merge
      const maxStack = targetStack.item.maxStackSize
      const spaceAvailable = maxStack - targetStack.count
      const toTransfer = Math.min(spaceAvailable, dragged.count)

      if (toTransfer > 0) {
        // Merge what fits
        const newTargetCount = targetStack.count + toTransfer
        setStackInSlot(target, { item: targetStack.item, count: newTargetCount })
        renderStackInSlot(target.element, { item: targetStack.item, count: newTargetCount })

        // Return overflow to source
        const overflow = dragged.count - toTransfer
        if (overflow > 0) {
          returnToSource(source, { item: dragged.item, count: overflow })
        }
      } else {
        // No space - return all to source
        returnToSource(source, dragged)
      }
    } else if (getStackFromSlot(source)) {
      // The source still holds the rest of a split (shift) stack: the
      // target's items have nowhere to go - no swap, the dragged items go home
      returnToSource(source, dragged)
    } else {
      // Different items: put dragged in target, return target's items to source
      setStackInSlot(target, dragged)
      renderStackInSlot(target.element, dragged)
      returnToSource(source, targetStack)
    }

    onStateChanged?.()
  }

  function slotInfosFor(
    container: DragDropSlotInfo['container'],
    elements: HTMLDivElement[]
  ): DragDropSlotInfo[] {
    return elements.map((element, index) => ({ element, container, index }))
  }

  /**
   * Ctrl+click: move a whole stack to the "other side" — player slots go to
   * an open block inventory (or between toolbar and inventory grid when none
   * is open), block/crafting slots come back to the player. Merges into
   * existing stacks first, then takes the first empty slot; whatever doesn't
   * fit stays where it was.
   */
  function performQuickTransfer(source: DragDropSlotInfo, stack: IItemStack): void {
    let targets: DragDropSlotInfo[]
    if (source.container === 'crafting' || source.container === 'extra') {
      targets = [
        ...slotInfosFor('inventory', inventorySlots),
        ...slotInfosFor('toolbar', toolbarSlots),
      ]
    } else if (quickTransferIntoCrafting && craftingSlots && craftingSlots.length > 0 && (!craftingRoot || craftingRoot.getClientRects().length > 0)) {
      targets = slotInfosFor('crafting', craftingSlots)
    } else if (source.container === 'toolbar') {
      targets = slotInfosFor('inventory', inventorySlots)
    } else {
      targets = slotInfosFor('toolbar', toolbarSlots)
    }

    const accepts = (target: DragDropSlotInfo): boolean =>
      target.container !== 'crafting' ||
      !craftingSlotAccepts ||
      craftingSlotAccepts(target.index, stack.item)

    let remaining = stack.count
    const maxStack = stack.item.maxStackSize

    // Top up existing stacks of the same item first
    for (const target of targets) {
      if (remaining <= 0) break
      if (!accepts(target)) continue
      const existing = getStackFromSlot(target)
      if (!existing || existing.item.id !== stack.item.id) continue
      const space = maxStack - existing.count
      if (space <= 0) continue
      const moved = Math.min(space, remaining)
      const merged = { item: existing.item, count: existing.count + moved }
      setStackInSlot(target, merged)
      renderStackInSlot(target.element, merged)
      remaining -= moved
    }

    // Then drop the remainder into the first empty slot that accepts it
    for (const target of targets) {
      if (remaining <= 0) break
      if (!accepts(target)) continue
      if (getStackFromSlot(target)) continue
      const placed = { item: stack.item, count: remaining }
      setStackInSlot(target, placed)
      renderStackInSlot(target.element, placed)
      remaining = 0
    }

    const leftover = remaining > 0 ? { item: stack.item, count: remaining } : null
    setStackInSlot(source, leftover)
    renderStackInSlot(source.element, leftover)

    onStateChanged?.()
  }

  /**
   * Shift+click on a player slot: put its item into an extra container slot
   * that takes it (e.g. wear armor), swapping out what was there. Returns
   * false when no extra container takes the item.
   */
  function performQuickPlaceIntoExtra(source: DragDropSlotInfo, stack: IItemStack): boolean {
    for (const extra of extraContainers) {
      const index = extra.quickTarget?.(stack.item) ?? -1
      if (index < 0 || !extra.accepts(index, stack.item)) continue
      const target: DragDropSlotInfo = { element: extra.slots[index], container: 'extra', index, extra }
      const previous = getStackFromSlot(target)
      // Only one item moves; a swap needs the source slot to empty out
      if (previous && stack.count > 1) continue
      const moved = { item: stack.item, count: 1 }
      const sourceRemainder = stack.count > 1 ? { item: stack.item, count: stack.count - 1 } : previous
      setStackInSlot(target, moved)
      renderStackInSlot(target.element, moved)
      setStackInSlot(source, sourceRemainder)
      renderStackInSlot(source.element, sourceRemainder)
      onStateChanged?.()
      return true
    }
    return false
  }

  /**
   * The virtual cursor's shape over the slots: a fist while dragging; over an
   * item, swap arrows when a click would move it somewhere else (Ctrl, or
   * Shift into or out of an extra container like worn armor), else an open hand.
   */
  function cursorShape(context: CursorContext): CursorShape | null {
    if (dragging) return 'grabbing'
    const slot = findSlotUnderPoint(context.x, context.y)
    const stack = slot ? getStackFromSlot(slot) : null
    if (!slot || !stack) return null
    if (context.ctrlKey) return 'transfer'
    if (context.shiftKey) {
      if (slot.container === 'extra') return 'transfer'
      const takesIt = extraContainers.some((extra) => {
        const index = extra.quickTarget?.(stack.item) ?? -1
        return index >= 0 && extra.accepts(index, stack.item)
      })
      if (takesIt && (slot.container === 'toolbar' || slot.container === 'inventory')) return 'transfer'
    }
    return 'grab'
  }

  function cancelDrag(): void {
    if (dragging && dragSource) {
      dragSource.element.style.opacity = '1'
      // Return dragged items to source
      if (draggedStack) {
        returnToSource(dragSource, draggedStack)
      }
    }
    removeGhost()
    hideTooltip()
    dragging = false
    dragSource = null
    draggedStack = null
  }

  // Event handlers
  function onMouseDown(event: MouseEvent): void {
    if (!enabled || event.button !== 0) return

    const slot = findSlotUnderPoint(event.clientX, event.clientY)
    if (!slot) return

    const stack = getStackFromSlot(slot)
    if (!stack) return

    event.preventDefault()
    playSound('ui.pick')

    // Hide tooltip when starting to drag
    hideTooltip()

    // Ctrl+click: quick transfer instead of dragging
    if (event.ctrlKey) {
      performQuickTransfer(slot, stack)
      return
    }

    // Shift+click: an extra container slot (worn armor) goes back to the
    // player; a player-slot item an extra container takes goes into it
    if (event.shiftKey) {
      if (slot.container === 'extra') {
        performQuickTransfer(slot, stack)
        return
      }
      if ((slot.container === 'toolbar' || slot.container === 'inventory') && performQuickPlaceIntoExtra(slot, stack)) {
        return
      }
    }

    // Determine how many items to pick up based on modifiers
    let pickupCount = stack.count

    if (event.shiftKey) {
      // Shift: pick up half (round up)
      pickupCount = Math.ceil(stack.count / 2)
    }

    // Create the dragged stack
    draggedStack = { item: stack.item, count: pickupCount }

    // Update source slot (leave remainder, or clear if taking all)
    const remaining = stack.count - pickupCount
    if (remaining > 0) {
      setStackInSlot(slot, { item: stack.item, count: remaining })
      renderStackInSlot(slot.element, { item: stack.item, count: remaining })
    } else {
      setStackInSlot(slot, null)
      renderStackInSlot(slot.element, null)
    }

    dragging = true
    dragSource = slot

    // Create ghost showing the dragged amount
    ghostElement = createGhostElement(draggedStack)
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
    if (!dragging || !dragSource || !draggedStack) {
      return
    }

    // Find closest slot if dropped within inventory/toolbar area
    const targetSlot = findClosestSlot(event.clientX, event.clientY)

    // Restore source slot opacity
    dragSource.element.style.opacity = '1'

    // Handle drop
    if (targetSlot && (targetSlot.container !== dragSource.container || targetSlot.index !== dragSource.index)) {
      // Valid target - perform drop with merge logic
      performDrop(dragSource, targetSlot, draggedStack)
      playSound('ui.drop')
    } else if (!targetSlot && !isOverPanel(event.clientX, event.clientY) && onDropOutside?.(draggedStack)) {
      // Released over the game world and the stack was thrown out (a panel
      // without a slot under the cursor, e.g. the Hellforge's recipe list,
      // returns the stack instead)
      onStateChanged?.()
      playSound('player.swing')
    } else {
      // Dropped on same slot or throw not handled - return items to source
      returnToSource(dragSource, draggedStack)
      playSound('ui.drop', null, { volume: 0.6 })
    }

    // Cleanup
    removeGhost()
    dragging = false
    dragSource = null
    draggedStack = null
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
    if (craftingSlots) {
      craftingSlots.forEach(slot => { slot.style.pointerEvents = value })
    }
    for (const extra of extraContainers) {
      extra.slots.forEach(slot => { slot.style.pointerEvents = value })
    }
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
      removeCursorShape = addCursorShapeProvider(cursorShape)
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
      removeCursorShape?.()
      removeCursorShape = null
    },

    addContainer(container: DragDropExtraContainer): void {
      extraContainers.push(container)
      if (enabled) {
        buildSlotMap()
        enableSlotPointerEvents(true)
      }
    },

    dispose(): void {
      this.disable()
      slotMap.clear()
    }
  }
}
