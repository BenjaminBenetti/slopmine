import { HudOrder, mountHudElement } from './hudLayout.ts'

/**
 * A short centred status line above the hotbar ("Return Idol recharging:
 * 1:12"), in the HUD's bottom-centre column above the hearts, armor row and
 * player notices; faded out after a few seconds, then it gives its space
 * back. Pointer-transparent.
 */
export interface HudMessageUI {
  readonly root: HTMLDivElement
  show(text: string, seconds?: number, color?: string): void
  destroy(): void
}

const FADE_MS = 250

export function createHudMessageUI(parent: HTMLElement = document.body): HudMessageUI {
  const root = document.createElement('div')
  root.style.cssText = `
    padding: 4px 12px;
    border-radius: 4px;
    background: rgba(10, 8, 16, 0.6);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
    pointer-events: none;
    user-select: none;
    opacity: 0;
    display: none;
    transition: opacity ${FADE_MS}ms ease;
  `
  mountHudElement(root, 'bottomCenter', HudOrder.STATUS_MESSAGE, parent)

  let hideTimer: ReturnType<typeof setTimeout> | null = null
  let collapseTimer: ReturnType<typeof setTimeout> | null = null

  return {
    root,
    show(text: string, seconds = 2.2, color = '#f0e6ff'): void {
      root.textContent = text
      root.style.color = color
      if (root.style.display === 'none') {
        root.style.display = ''
        void root.offsetWidth // start the fade-in from the collapsed state
      }
      root.style.opacity = '1'
      if (hideTimer !== null) clearTimeout(hideTimer)
      if (collapseTimer !== null) clearTimeout(collapseTimer)
      collapseTimer = null
      hideTimer = setTimeout(() => {
        root.style.opacity = '0'
        hideTimer = null
        collapseTimer = setTimeout(() => {
          root.style.display = 'none'
          collapseTimer = null
        }, FADE_MS)
      }, seconds * 1000)
    },
    destroy(): void {
      if (hideTimer !== null) clearTimeout(hideTimer)
      if (collapseTimer !== null) clearTimeout(collapseTimer)
      root.remove()
    },
  }
}
