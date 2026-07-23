export interface BurnVignetteUI {
  readonly element: HTMLDivElement
  setActive(active: boolean): void
  destroy(): void
}

/**
 * Full-screen red edge glow shown while the player is in lava or burning.
 * Implemented as a pointer-transparent DOM overlay above the WebGL canvas,
 * below the HUD (toolbar z-index 25, crosshair 30).
 */
export function createBurnVignetteUI(
  parent: HTMLElement = document.body
): BurnVignetteUI {
  const el = document.createElement('div')
  el.style.position = 'fixed'
  el.style.inset = '0'
  el.style.pointerEvents = 'none'
  el.style.zIndex = '20'
  el.style.opacity = '0'
  el.style.transition = 'opacity 0.3s ease'
  el.style.background =
    'radial-gradient(ellipse at center, rgba(255, 60, 0, 0) 55%, rgba(255, 60, 0, 0.35) 100%)'
  el.style.boxShadow =
    'inset 0 0 12vmin 3vmin rgba(255, 80, 0, 0.55), inset 0 0 24vmin 8vmin rgba(200, 30, 0, 0.35)'

  parent.appendChild(el)

  let active = false

  return {
    element: el,
    setActive(next: boolean): void {
      if (next === active) {
        return
      }
      active = next
      el.style.opacity = next ? '1' : '0'
    },
    destroy(): void {
      if (el.parentElement === parent) {
        parent.removeChild(el)
      }
    },
  }
}
