export interface DeathScreenUI {
  readonly element: HTMLDivElement
  show(): void
  hide(): void
  destroy(): void
}

/**
 * Creates a Dark Souls-style "YOU DIED" death screen.
 * Features dramatic fade-in with red text on dark background.
 */
export function createDeathScreenUI(
  parent: HTMLElement = document.body
): DeathScreenUI {
  // Main container - covers entire screen
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
    opacity: 0;
    pointer-events: none;
    transition: opacity 1.5s ease-in;
  `

  // Fully opaque black background to hide world during chunk generation
  const overlay = document.createElement('div')
  overlay.style.cssText = `
    position: absolute;
    inset: 0;
    background: #000;
  `
  container.appendChild(overlay)

  // Subtle vignette effect on top
  const vignette = document.createElement('div')
  vignette.style.cssText = `
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, rgba(20,0,0,0) 0%, rgba(0,0,0,0.4) 100%);
  `
  container.appendChild(vignette)

  // "YOU DIED" text
  const text = document.createElement('div')
  text.textContent = 'YOU DIED'
  text.style.cssText = `
    position: relative;
    z-index: 1;
    font-family: 'Times New Roman', 'Garamond', Georgia, serif;
    font-size: clamp(48px, 10vw, 120px);
    font-weight: 400;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: #8b0000;
    text-shadow: 
      0 0 20px rgba(139, 0, 0, 0.8),
      0 0 40px rgba(139, 0, 0, 0.6),
      0 0 60px rgba(139, 0, 0, 0.4),
      0 4px 8px rgba(0, 0, 0, 0.8);
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 2s ease-out 0.5s, transform 3s ease-out 0.5s;
  `
  container.appendChild(text)

  parent.appendChild(container)

  return {
    element: container,

    show(): void {
      // Reset animations
      container.style.opacity = '0'
      text.style.opacity = '0'
      text.style.transform = 'scale(0.9)'

      // Force reflow to restart animations
      void container.offsetWidth

      // Trigger fade in
      container.style.opacity = '1'
      text.style.opacity = '1'
      text.style.transform = 'scale(1)'
    },

    hide(): void {
      container.style.transition = 'opacity 0.5s ease-out'
      container.style.opacity = '0'
      text.style.opacity = '0'
    },

    destroy(): void {
      if (container.parentElement === parent) {
        parent.removeChild(container)
      }
    },
  }
}
