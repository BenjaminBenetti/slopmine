/**
 * The screen fades to black while the player sleeps, then back to the
 * morning. `onDark` runs at the darkest point (where the clock jumps).
 */

const FADE_MS = 900
const HOLD_MS = 700

let overlay: HTMLDivElement | null = null
let playing = false

function getOverlay(): HTMLDivElement {
  if (overlay) return overlay
  const el = document.createElement('div')
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    background: '#000',
    opacity: '0',
    pointerEvents: 'none',
    transition: `opacity ${FADE_MS}ms ease-in-out`,
    zIndex: '900',
  } satisfies Partial<CSSStyleDeclaration>)
  document.body.appendChild(el)
  overlay = el
  return el
}

/** Fade out, run `onDark`, fade back in. A second call while one plays is ignored. */
export function playSleepFade(onDark: () => void): void {
  if (playing || typeof document === 'undefined') {
    if (!playing) onDark()
    return
  }
  playing = true
  const el = getOverlay()
  // Next frame, so the transition starts from 0
  requestAnimationFrame(() => {
    el.style.opacity = '1'
  })
  setTimeout(() => {
    onDark()
    setTimeout(() => {
      el.style.opacity = '0'
      setTimeout(() => {
        playing = false
      }, FADE_MS)
    }, HOLD_MS)
  }, FADE_MS)
}
