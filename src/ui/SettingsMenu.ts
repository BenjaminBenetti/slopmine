import type { GenerationConfig } from '../world/generate/GenerationConfig.ts'

export type SettingsPage = 'main' | 'config'

export interface SettingsMenuUIOptions {
  /** Called when the user clicks "Resume Game" */
  onResume?: () => void
  /** Called when chunk distance setting changes */
  onChunkDistanceChange?: (value: number) => void
}

export interface SettingsMenuUI {
  readonly root: HTMLDivElement
  readonly isOpen: boolean
  open(): void
  close(): void
  toggle(): void
  destroy(): void
}

/**
 * Creates a settings menu overlay with main menu and configuration page.
 * Uses the same visual style as the inventory UI.
 */
export function createSettingsMenuUI(
  config: GenerationConfig,
  parent: HTMLElement = document.body,
  options: SettingsMenuUIOptions = {},
): SettingsMenuUI {
  let currentPage: SettingsPage = 'main'
  let open = false

  // Overlay backdrop
  const overlay = document.createElement('div')
  overlay.style.position = 'fixed'
  overlay.style.inset = '0'
  overlay.style.display = 'none'
  overlay.style.alignItems = 'center'
  overlay.style.justifyContent = 'center'
  overlay.style.background = 'rgba(0, 0, 0, 0.45)'
  overlay.style.zIndex = '40'

  // Main panel
  const panel = document.createElement('div')
  panel.style.background = 'rgba(12, 12, 12, 0.96)'
  panel.style.borderRadius = '8px'
  panel.style.border = '2px solid rgba(255, 255, 255, 0.18)'
  panel.style.boxShadow = '0 0 14px rgba(0, 0, 0, 0.95)'
  panel.style.padding = '1.5rem 2rem'
  panel.style.minWidth = '320px'
  panel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  panel.style.color = 'rgba(255, 255, 255, 0.9)'

  overlay.appendChild(panel)
  parent.appendChild(overlay)

  const applyVisibility = (): void => {
    overlay.style.display = open ? 'flex' : 'none'
  }

  const createButton = (text: string, onClick: () => void): HTMLButtonElement => {
    const button = document.createElement('button')
    button.textContent = text
    button.style.display = 'block'
    button.style.width = '100%'
    button.style.padding = '0.75rem 1rem'
    button.style.marginBottom = '0.5rem'
    button.style.background = 'rgba(50, 50, 50, 0.9)'
    button.style.border = '2px solid rgba(255, 255, 255, 0.3)'
    button.style.borderRadius = '4px'
    button.style.color = 'rgba(255, 255, 255, 0.9)'
    button.style.fontSize = '1rem'
    button.style.fontFamily = 'inherit'
    button.style.cursor = 'pointer'
    button.style.transition = 'background 0.15s, border-color 0.15s'

    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(70, 70, 70, 0.9)'
      button.style.borderColor = 'rgba(255, 255, 255, 0.5)'
    })
    button.addEventListener('mouseleave', () => {
      button.style.background = 'rgba(50, 50, 50, 0.9)'
      button.style.borderColor = 'rgba(255, 255, 255, 0.3)'
    })
    button.addEventListener('click', onClick)

    return button
  }

  const renderMainMenu = (): void => {
    panel.innerHTML = ''
    currentPage = 'main'

    const title = document.createElement('h2')
    title.textContent = 'Game Paused'
    title.style.margin = '0 0 1.5rem 0'
    title.style.fontSize = '1.5rem'
    title.style.fontWeight = '600'
    title.style.textAlign = 'center'
    panel.appendChild(title)

    const newGameBtn = createButton('New Game', () => {
      renderNewGameConfirmation()
    })
    panel.appendChild(newGameBtn)

    const settingsBtn = createButton('Settings', () => {
      renderConfigPage()
    })
    panel.appendChild(settingsBtn)

    const resumeBtn = createButton('Resume Game', () => {
      api.close()
      options.onResume?.()
    })
    panel.appendChild(resumeBtn)
  }

  const renderNewGameConfirmation = (): void => {
    panel.innerHTML = ''

    const title = document.createElement('h2')
    title.textContent = 'New Game'
    title.style.margin = '0 0 1rem 0'
    title.style.fontSize = '1.5rem'
    title.style.fontWeight = '600'
    title.style.textAlign = 'center'
    panel.appendChild(title)

    const warning = document.createElement('p')
    warning.textContent = 'This will generate a new world. Your current world will be lost.'
    warning.style.margin = '0 0 1.5rem 0'
    warning.style.fontSize = '0.95rem'
    warning.style.textAlign = 'center'
    warning.style.color = 'rgba(255, 200, 200, 0.9)'
    panel.appendChild(warning)

    const confirmBtn = createButton('Start New World', () => {
      config.regenerateSeed()
      window.location.reload()
    })
    confirmBtn.style.background = 'rgba(120, 40, 40, 0.9)'
    confirmBtn.style.borderColor = 'rgba(255, 100, 100, 0.5)'
    confirmBtn.addEventListener('mouseenter', () => {
      confirmBtn.style.background = 'rgba(150, 50, 50, 0.9)'
      confirmBtn.style.borderColor = 'rgba(255, 120, 120, 0.6)'
    })
    confirmBtn.addEventListener('mouseleave', () => {
      confirmBtn.style.background = 'rgba(120, 40, 40, 0.9)'
      confirmBtn.style.borderColor = 'rgba(255, 100, 100, 0.5)'
    })
    panel.appendChild(confirmBtn)

    const cancelBtn = createButton('Cancel', () => {
      renderMainMenu()
    })
    panel.appendChild(cancelBtn)
  }

  const renderConfigPage = (): void => {
    panel.innerHTML = ''
    currentPage = 'config'

    const title = document.createElement('h2')
    title.textContent = 'Settings'
    title.style.margin = '0 0 1.5rem 0'
    title.style.fontSize = '1.5rem'
    title.style.fontWeight = '600'
    title.style.textAlign = 'center'
    panel.appendChild(title)

    // Chunk Distance slider
    const sliderContainer = document.createElement('div')
    sliderContainer.style.marginBottom = '1.5rem'

    const sliderLabel = document.createElement('label')
    sliderLabel.style.display = 'flex'
    sliderLabel.style.justifyContent = 'space-between'
    sliderLabel.style.marginBottom = '0.5rem'
    sliderLabel.style.fontSize = '0.9rem'
    
    const labelText = document.createElement('span')
    labelText.textContent = 'Render Distance'
    
    const valueDisplay = document.createElement('span')
    valueDisplay.textContent = String(config.chunkDistance)
    valueDisplay.style.color = 'rgba(255, 255, 255, 0.7)'
    
    sliderLabel.appendChild(labelText)
    sliderLabel.appendChild(valueDisplay)

    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = '2'
    slider.max = '32'
    slider.value = String(config.chunkDistance)
    slider.style.width = '100%'
    slider.style.cursor = 'pointer'

    slider.addEventListener('input', () => {
      const value = parseInt(slider.value, 10)
      valueDisplay.textContent = String(value)
      config.chunkDistance = value
      options.onChunkDistanceChange?.(value)
    })

    sliderContainer.appendChild(sliderLabel)
    sliderContainer.appendChild(slider)
    panel.appendChild(sliderContainer)

    const backBtn = createButton('Back', () => {
      renderMainMenu()
    })
    panel.appendChild(backBtn)
  }

  const api: SettingsMenuUI = {
    root: overlay,
    get isOpen() {
      return open
    },
    open(): void {
      open = true
      renderMainMenu()
      applyVisibility()
    },
    close(): void {
      open = false
      applyVisibility()
    },
    toggle(): void {
      if (open) {
        this.close()
      } else {
        this.open()
      }
    },
    destroy(): void {
      if (overlay.parentElement === parent) {
        parent.removeChild(overlay)
      }
    },
  }

  applyVisibility()
  return api
}

