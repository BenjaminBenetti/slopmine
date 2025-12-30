import type { IItem } from '../items/Item.ts'

/**
 * Renders an item's icon into a slot element.
 * Clears the slot if item is null.
 */
export function renderItemInSlot(slot: HTMLDivElement, item: IItem | null): void {
  // Remove existing icon (preserve other children like labels)
  const existingIcon = slot.querySelector('[data-item-icon]')
  if (existingIcon) {
    existingIcon.remove()
  }

  if (!item || !item.iconUrl) {
    return
  }

  const icon = document.createElement('img')
  icon.setAttribute('data-item-icon', 'true')
  icon.src = item.iconUrl
  icon.alt = item.displayName
  icon.draggable = false
  icon.style.width = '80%'
  icon.style.height = '80%'
  icon.style.objectFit = 'contain'
  icon.style.pointerEvents = 'none'
  icon.style.imageRendering = 'pixelated'

  slot.appendChild(icon)
}

/**
 * Updates all slots in a slot array from corresponding state slots.
 */
export function syncSlotsFromState(
  uiSlots: HTMLDivElement[],
  stateSlots: ReadonlyArray<IItem | null>
): void {
  const length = Math.min(uiSlots.length, stateSlots.length)
  for (let i = 0; i < length; i++) {
    renderItemInSlot(uiSlots[i], stateSlots[i])
  }
}
