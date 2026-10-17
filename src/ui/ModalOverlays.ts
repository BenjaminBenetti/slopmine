/**
 * Registry of modal DOM overlays that release pointer lock while open
 * (journal, ...). The settings input handler treats an open modal overlay
 * like the open inventory: losing pointer lock to it must not pop up the
 * pause menu.
 */

const openChecks = new Set<() => boolean>()

/** Register an overlay's "is open" check. Returns an unregister function. */
export function registerModalOverlay(isOpen: () => boolean): () => void {
  openChecks.add(isOpen)
  return () => {
    openChecks.delete(isOpen)
  }
}

/** Whether any registered modal overlay is open. */
export function isModalOverlayOpen(): boolean {
  for (const isOpen of openChecks) {
    if (isOpen()) return true
  }
  return false
}
