/**
 * Who has the mouse. The canvas keeps pointer lock for as long as the game is
 * played - in gameplay AND while the inventory, a block UI or the journal is
 * open (those menus show the virtual cursor, ui/VirtualCursor.ts) - and only
 * loses it to Esc or leaving the window, which brings up the pause menu, the
 * one screen with the real mouse. (Menus used to release the lock and take it
 * back on close; browsers now and then ended up in the wrong state - the
 * mouse escaping the window - and the free mouse selected page text.)
 *
 * Gameplay input (mining, placing, the hotbar wheel, the block outline...)
 * asks `hasGameplayPointer()`, never `document.pointerLockElement` alone: the
 * lock is also held while a menu is open.
 */

let lockTarget: Element | null = null
const openMenus = new Set<string>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.error('Pointer mode listener failed:', error)
    }
  }
}

/** The element that holds pointer lock (the game canvas). Call once at startup. */
export function setPointerLockTarget(element: Element): void {
  if (lockTarget) return
  lockTarget = element
  document.addEventListener('pointerlockchange', notify)
}

/** The canvas holds pointer lock (in gameplay or in a menu with the virtual cursor). */
export function isPointerLocked(): boolean {
  return lockTarget !== null && document.pointerLockElement === lockTarget
}

/** A menu that uses the virtual cursor is open. */
export function isCursorMenuOpen(): boolean {
  return openMenus.size > 0
}

/** In gameplay: the pointer is locked and no menu has the cursor. */
export function hasGameplayPointer(): boolean {
  return isPointerLocked() && openMenus.size === 0
}

/** A menu opened: the mouse drives the virtual cursor until it closes (`id` names the menu). */
export function openCursorMenu(id: string): void {
  if (openMenus.has(id)) return
  openMenus.add(id)
  notify()
}

export function closeCursorMenu(id: string): void {
  if (!openMenus.delete(id)) return
  notify()
}

/**
 * Called whenever the pointer is locked or released, or a cursor menu opens
 * or closes. Returns an unsubscribe function.
 */
export function onPointerModeChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
