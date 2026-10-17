/**
 * Return Idol visuals: while channeling, a violet glow closes in from the
 * screen edges and a ring fills around the crosshair; during the teleport a
 * veil covers the screen until the destination has loaded.
 * Pointer-transparent DOM overlays above the canvas.
 */
export interface ReturnIdolOverlayUI {
  /** Channel progress 0-1, or null to hide the channel cue. */
  setChannelProgress(progress: number | null): void
  showVeil(text: string): void
  hideVeil(): void
  destroy(): void
}

const RING_SIZE = 58
const RING_RADIUS = 24
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export function createReturnIdolOverlayUI(parent: HTMLElement = document.body): ReturnIdolOverlayUI {
  // Channel glow (below the HUD, above the burn vignette)
  const glow = document.createElement('div')
  glow.style.cssText = `
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 21;
    opacity: 0;
    background: radial-gradient(ellipse at center, rgba(150, 70, 255, 0) 38%, rgba(150, 70, 255, 0.32) 78%, rgba(90, 20, 170, 0.6) 100%);
    box-shadow: inset 0 0 14vmin 4vmin rgba(170, 90, 255, 0.45);
  `

  const ringNs = 'http://www.w3.org/2000/svg'
  const ring = document.createElementNS(ringNs, 'svg')
  ring.setAttribute('width', String(RING_SIZE))
  ring.setAttribute('height', String(RING_SIZE))
  ring.setAttribute('viewBox', `0 0 ${RING_SIZE} ${RING_SIZE}`)
  ring.style.cssText = `
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) rotate(-90deg);
    pointer-events: none;
    z-index: 31;
    display: none;
    filter: drop-shadow(0 0 4px rgba(190, 120, 255, 0.9));
  `
  const track = document.createElementNS(ringNs, 'circle')
  const arc = document.createElementNS(ringNs, 'circle')
  for (const circle of [track, arc]) {
    circle.setAttribute('cx', String(RING_SIZE / 2))
    circle.setAttribute('cy', String(RING_SIZE / 2))
    circle.setAttribute('r', String(RING_RADIUS))
    circle.setAttribute('fill', 'none')
    circle.setAttribute('stroke-width', '4')
  }
  track.setAttribute('stroke', 'rgba(20, 8, 40, 0.55)')
  arc.setAttribute('stroke', '#c48dff')
  arc.setAttribute('stroke-linecap', 'round')
  arc.setAttribute('stroke-dasharray', String(RING_CIRCUMFERENCE))
  ring.append(track, arc)

  // Teleport veil (above the HUD, below the loading screen)
  const veil = document.createElement('div')
  veil.style.cssText = `
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 900;
    opacity: 0;
    transition: opacity 0.35s ease;
    background: radial-gradient(ellipse at center, rgba(70, 24, 120, 0.94) 0%, rgba(14, 4, 26, 0.99) 75%);
    display: flex;
    align-items: center;
    justify-content: center;
  `
  const veilText = document.createElement('div')
  veilText.style.cssText = `
    font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 22px;
    letter-spacing: 0.18em;
    color: #e6d4ff;
    text-shadow: 0 0 12px rgba(190, 120, 255, 0.9);
  `
  veil.appendChild(veilText)

  parent.append(glow, ring, veil)

  let shownProgress: number | null = null

  return {
    setChannelProgress(progress: number | null): void {
      if (progress === null) {
        if (shownProgress === null) return
        shownProgress = null
        glow.style.opacity = '0'
        ring.style.display = 'none'
        return
      }
      const p = Math.max(0, Math.min(1, progress))
      if (shownProgress !== null && Math.abs(p - shownProgress) < 0.004) return
      shownProgress = p
      glow.style.opacity = (0.15 + 0.85 * p * p).toFixed(3)
      ring.style.display = 'block'
      arc.setAttribute('stroke-dashoffset', (RING_CIRCUMFERENCE * (1 - p)).toFixed(2))
    },
    showVeil(text: string): void {
      veilText.textContent = text
      veil.style.opacity = '1'
    },
    hideVeil(): void {
      veil.style.transition = 'opacity 0.8s ease'
      veil.style.opacity = '0'
    },
    destroy(): void {
      glow.remove()
      ring.remove()
      veil.remove()
    },
  }
}
