export interface CrosshairOptions {
  sizePx?: number
  color?: string
}

export interface CrosshairUI {
  readonly element: HTMLDivElement
  destroy(): void
}

/**
 * Creates a small dot crosshair fixed at the center of the screen.
 * Implemented as a simple DOM overlay above the WebGL canvas.
 */
export function createCrosshairUI(
  parent: HTMLElement = document.body,
  options: CrosshairOptions = {}
): CrosshairUI {
  const size = options.sizePx ?? 6
  const color = options.color ?? '#ffffff'

  const el = document.createElement('div')
  el.style.position = 'fixed'
  el.style.left = '50%'
  el.style.top = '50%'
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  el.style.transform = 'translate(-50%, -50%)'
  el.style.borderRadius = '50%'
  el.style.backgroundColor = color
  el.style.boxShadow = '0 0 4px rgba(0, 0, 0, 0.8)'
  el.style.pointerEvents = 'none'
  el.style.zIndex = '30'

  parent.appendChild(el)

  return {
    element: el,
    destroy(): void {
      if (el.parentElement === parent) {
        parent.removeChild(el)
      }
    },
  }
}

