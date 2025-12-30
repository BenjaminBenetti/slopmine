import type { IItemStack } from '../player/PlayerState.ts'

/**
 * Renders an item stack's icon and count into a slot element.
 * Clears the slot if stack is null.
 */
export function renderStackInSlot(slot: HTMLDivElement, stack: IItemStack | null): void {
  // Remove existing icon and count (preserve other children like labels)
  const existingIcon = slot.querySelector('[data-item-icon]')
  if (existingIcon) {
    existingIcon.remove()
  }
  const existingCount = slot.querySelector('[data-stack-count]')
  if (existingCount) {
    existingCount.remove()
  }

  if (!stack || !stack.item.iconUrl) {
    return
  }

  const icon = document.createElement('img')
  icon.setAttribute('data-item-icon', 'true')
  icon.src = stack.item.iconUrl
  icon.alt = stack.item.displayName
  icon.draggable = false
  icon.style.width = '80%'
  icon.style.height = '80%'
  icon.style.objectFit = 'contain'
  icon.style.pointerEvents = 'none'
  icon.style.imageRendering = 'pixelated'

  slot.appendChild(icon)

  // Show count if more than 1
  if (stack.count > 1) {
    const countLabel = document.createElement('div')
    countLabel.setAttribute('data-stack-count', 'true')
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
    countLabel.style.zIndex = '1'

    slot.appendChild(countLabel)
  }
}

/**
 * Updates all slots in a slot array from corresponding state slots.
 */
export function syncSlotsFromState(
  uiSlots: HTMLDivElement[],
  stateSlots: ReadonlyArray<IItemStack | null>
): void {
  const length = Math.min(uiSlots.length, stateSlots.length)
  for (let i = 0; i < length; i++) {
    renderStackInSlot(uiSlots[i], stateSlots[i])
  }
}
