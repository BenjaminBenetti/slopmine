import type { IItemStack } from '../player/PlayerState.ts'

/**
 * Renders an item stack's icon and count into a slot element.
 * Uses differential rendering to avoid recreating DOM elements when content hasn't changed.
 * Clears the slot if stack is null.
 */
export function renderStackInSlot(slot: HTMLDivElement, stack: IItemStack | null): void {
  const existingIcon = slot.querySelector('[data-item-icon]') as HTMLImageElement | null
  const existingCount = slot.querySelector('[data-stack-count]') as HTMLElement | null

  const newIconUrl = stack?.item.iconUrl || null

  // Check if the icon needs to change
  // Use endsWith() because browser may resolve relative URLs to absolute
  const iconMatches = existingIcon && newIconUrl && existingIcon.src.endsWith(newIconUrl)
  const bothEmpty = !existingIcon && !newIconUrl

  if (iconMatches || bothEmpty) {
    // Icon unchanged - only update count if needed
    const newCount = stack && stack.count > 1 ? String(stack.count) : null

    if (newCount) {
      if (existingCount) {
        // Update existing count if different
        if (existingCount.textContent !== newCount) {
          existingCount.textContent = newCount
        }
      } else {
        // Create count label
        const countLabel = document.createElement('div')
        countLabel.setAttribute('data-stack-count', 'true')
        countLabel.textContent = newCount
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
    } else if (existingCount) {
      // Remove count if no longer needed
      existingCount.remove()
    }
    return // Early return - no icon recreation needed
  }

  // Icon changed - remove old elements
  if (existingIcon) existingIcon.remove()
  if (existingCount) existingCount.remove()

  if (!stack || !stack.item.iconUrl) {
    return
  }

  // Create new icon
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

  // Create count if needed
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
