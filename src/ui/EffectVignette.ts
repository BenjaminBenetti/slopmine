/**
 * Screen-edge cues for debuffs: a frosted blue rim while Frostbite (slowness)
 * is active, and a short green pulse on every poison tick. Pointer-
 * transparent, below the HUD (same layer as the burn vignette).
 */
export interface EffectVignetteUI {
  setFrost(active: boolean): void
  pulsePoison(): void
  destroy(): void
}

export function createEffectVignetteUI(parent: HTMLElement = document.body): EffectVignetteUI {
  const frost = document.createElement('div')
  frost.style.cssText = `
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 20;
    opacity: 0;
    transition: opacity 0.6s ease;
    background: radial-gradient(ellipse at center, rgba(160, 210, 255, 0) 58%, rgba(170, 215, 255, 0.28) 100%);
    box-shadow: inset 0 0 10vmin 2vmin rgba(200, 235, 255, 0.5), inset 0 0 22vmin 6vmin rgba(90, 150, 220, 0.25);
  `
  const poison = document.createElement('div')
  poison.style.cssText = `
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 20;
    opacity: 0;
    background: radial-gradient(ellipse at center, rgba(110, 160, 30, 0) 50%, rgba(110, 160, 30, 0.35) 100%);
    box-shadow: inset 0 0 12vmin 3vmin rgba(120, 170, 30, 0.5);
  `
  parent.append(frost, poison)

  let frostActive = false
  let poisonTimer: ReturnType<typeof setTimeout> | null = null

  return {
    setFrost(active: boolean): void {
      if (active === frostActive) return
      frostActive = active
      frost.style.opacity = active ? '1' : '0'
    },
    pulsePoison(): void {
      poison.style.transition = 'none'
      poison.style.opacity = '1'
      if (poisonTimer !== null) clearTimeout(poisonTimer)
      poisonTimer = setTimeout(() => {
        poison.style.transition = 'opacity 0.6s ease'
        poison.style.opacity = '0'
        poisonTimer = null
      }, 120)
    },
    destroy(): void {
      if (poisonTimer !== null) clearTimeout(poisonTimer)
      frost.remove()
      poison.remove()
    },
  }
}
