/**
 * HUD air bubbles: a row of bubbles just above the hearts (attached with
 * HealthDisplayUI.attachAbove, like the armor row) while the player's air is
 * not full - one bubble per tenth of the air. A bubble that empties pops
 * (a quick swell and fade); they refill one by one when the player surfaces.
 */
export interface BreathDisplayUI {
  readonly root: HTMLDivElement
  /** Show `air` of `maxAir` (seconds); hidden while full. */
  update(air: number, maxAir: number): void
}

const BUBBLE_COUNT = 10

let bubbleIdCounter = 0

function bubbleSvg(): string {
  const id = bubbleIdCounter++
  return `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">
      <defs>
        <radialGradient id="bb_${id}" cx="50%" cy="55%" r="55%">
          <stop offset="0%" stop-color="#b9ecff" stop-opacity="0.35"/>
          <stop offset="70%" stop-color="#5cc2f2" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="#e6f8ff" stop-opacity="0.95"/>
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="9" fill="url(#bb_${id})" stroke="#eaf9ff" stroke-width="1.2"/>
      <ellipse cx="8.6" cy="8.4" rx="2.6" ry="1.8" fill="white" opacity="0.85" transform="rotate(-35 8.6 8.4)"/>
      <circle cx="15.6" cy="15.4" r="1.1" fill="white" opacity="0.5"/>
    </svg>`
}

export function createBreathDisplayUI(iconSizePx = 17): BreathDisplayUI {
  const root = document.createElement('div')
  root.style.display = 'none'
  root.style.alignItems = 'center'
  root.style.gap = '2px'
  root.style.pointerEvents = 'none'

  const bubbles: HTMLDivElement[] = []
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    const bubble = document.createElement('div')
    bubble.style.width = `${iconSizePx}px`
    bubble.style.height = `${iconSizePx}px`
    bubble.style.filter = 'drop-shadow(1px 2px 2px rgba(0, 0, 0, 0.45))'
    bubble.style.transition = 'transform 0.18s ease-out, opacity 0.18s ease-out'
    bubble.innerHTML = bubbleSvg()
    bubbles.push(bubble)
    root.appendChild(bubble)
  }
  let shown = -1

  return {
    root,
    update(air: number, maxAir: number): void {
      if (air >= maxAir - 1e-3) {
        if (shown !== -1) {
          root.style.display = 'none'
          shown = -1
        }
        return
      }
      root.style.display = 'flex'
      // Bubbles left: a bubble stays until its whole tenth of the air is gone
      const count = Math.max(0, Math.ceil((air / maxAir) * BUBBLE_COUNT - 1e-6))
      if (count === shown) return
      for (let i = 0; i < BUBBLE_COUNT; i++) {
        const full = i < count
        const bubble = bubbles[i]
        // The last bubble to go pops; refilled ones swell back
        bubble.style.opacity = full ? '1' : '0'
        bubble.style.transform = full ? 'scale(1)' : 'scale(1.45)'
      }
      shown = count
    },
  }
}
