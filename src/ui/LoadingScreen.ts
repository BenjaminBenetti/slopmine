import loadingScreenBg from './assets/loading-screen-bg.png'

export interface LoadingScreenOptions {
  targetChunks?: number
  backgroundColor?: string
  barColor?: string
}

export interface LoadingScreenUI {
  readonly element: HTMLDivElement
  setProgress(chunksLoaded: number, totalChunks: number): void
  hide(): void
  show(): void
  destroy(): void
}

/**
 * Creates a full-screen loading overlay with a progress bar.
 * Shows chunk loading progress before the player spawns.
 */
export function createLoadingScreenUI(
  parent: HTMLElement = document.body,
  options: LoadingScreenOptions = {}
): LoadingScreenUI {
  const backgroundColor = options.backgroundColor ?? '#1a1a2e'
  const barColor = options.barColor ?? '#4ade80'

  // Container
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed;
    inset: 0;
    background: ${backgroundColor};
    background-image: url(${loadingScreenBg});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    font-family: 'Segoe UI', system-ui, sans-serif;
    transition: opacity 0.3s ease-out;
  `

  // Title - now shows loading status below the background title
  const title = document.createElement('div')
  title.textContent = 'Generating World...'
  title.style.cssText = `
    color: #ffffff;
    font-size: 24px;
    font-weight: 600;
    margin-top: 180px;
    margin-bottom: 32px;
    letter-spacing: 0.5px;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  `
  container.appendChild(title)

  // Progress bar container
  const barContainer = document.createElement('div')
  barContainer.style.cssText = `
    width: 320px;
    height: 10px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 5px;
    overflow: hidden;
    margin-bottom: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.2);
  `
  container.appendChild(barContainer)

  // Progress bar fill
  const barFill = document.createElement('div')
  barFill.style.cssText = `
    width: 0%;
    height: 100%;
    background: ${barColor};
    border-radius: 5px;
    transition: width 0.1s ease-out;
    box-shadow: 0 0 10px ${barColor};
  `
  barContainer.appendChild(barFill)

  // Progress text
  const progressText = document.createElement('div')
  progressText.textContent = '0 / 64 chunks'
  progressText.style.cssText = `
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.8);
  `
  container.appendChild(progressText)

  parent.appendChild(container)

  return {
    element: container,

    setProgress(chunksLoaded: number, totalChunks: number): void {
      const percent = Math.min(100, (chunksLoaded / totalChunks) * 100)
      barFill.style.width = `${percent}%`
      progressText.textContent = `${chunksLoaded} / ${totalChunks} chunks`
    },

    hide(): void {
      container.style.opacity = '0'
      container.style.pointerEvents = 'none'
      // Remove from DOM after fade
      setTimeout(() => {
        container.style.display = 'none'
      }, 300)
    },

    show(): void {
      container.style.display = 'flex'
      container.style.opacity = '1'
      container.style.pointerEvents = 'auto'
    },

    destroy(): void {
      if (container.parentElement === parent) {
        parent.removeChild(container)
      }
    },
  }
}
