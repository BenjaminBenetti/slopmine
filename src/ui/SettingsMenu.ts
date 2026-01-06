import type { GenerationConfig } from '../world/generate/GenerationConfig.ts'
import type { GraphicsSettings, ResolutionPreset, FramerateLimit, ShadowMapSize } from '../settings/index.ts'

export type SettingsPage = 'main' | 'config'

export interface SettingsMenuUIOptions {
  /** Called when the user clicks "Resume Game" */
  onResume?: () => void
  /** Called when chunk distance setting changes */
  onChunkDistanceChange?: (value: number) => void
  /** Called when resolution setting changes */
  onResolutionChange?: (preset: ResolutionPreset) => void
  /** Called when framerate limit setting changes */
  onFramerateLimitChange?: (limit: FramerateLimit) => void
  /** Called when shadows enabled setting changes */
  onShadowsEnabledChange?: (enabled: boolean) => void
  /** Called when shadow map size setting changes */
  onShadowMapSizeChange?: (size: ShadowMapSize) => void
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
  graphicsSettings: GraphicsSettings,
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

    // Resolution dropdown
    const resolutionContainer = document.createElement('div')
    resolutionContainer.style.marginBottom = '1.5rem'
    resolutionContainer.style.display = 'flex'
    resolutionContainer.style.alignItems = 'center'
    resolutionContainer.style.justifyContent = 'space-between'

    const resolutionLabel = document.createElement('label')
    resolutionLabel.textContent = 'Resolution'
    resolutionLabel.style.fontSize = '0.9rem'
    resolutionLabel.htmlFor = 'resolution-select'

    const resolutionSelect = document.createElement('select')
    resolutionSelect.id = 'resolution-select'
    resolutionSelect.style.padding = '0.4rem 0.6rem'
    resolutionSelect.style.background = 'rgba(50, 50, 50, 0.9)'
    resolutionSelect.style.border = '2px solid rgba(255, 255, 255, 0.3)'
    resolutionSelect.style.borderRadius = '4px'
    resolutionSelect.style.color = 'rgba(255, 255, 255, 0.9)'
    resolutionSelect.style.fontSize = '0.9rem'
    resolutionSelect.style.cursor = 'pointer'

    const resolutionOptions: { value: ResolutionPreset; label: string }[] = [
      { value: '720p', label: '720p' },
      { value: '1080p', label: '1080p' },
      { value: '1440p', label: '1440p' },
      { value: '4k', label: '4K' },
      { value: 'native', label: 'Native' },
    ]

    for (const opt of resolutionOptions) {
      const option = document.createElement('option')
      option.value = opt.value
      option.textContent = opt.label
      option.style.background = 'rgba(30, 30, 30, 1)'
      if (opt.value === graphicsSettings.resolutionPreset) {
        option.selected = true
      }
      resolutionSelect.appendChild(option)
    }

    resolutionSelect.addEventListener('change', () => {
      const preset = resolutionSelect.value as ResolutionPreset
      graphicsSettings.resolutionPreset = preset
      options.onResolutionChange?.(preset)
    })

    resolutionContainer.appendChild(resolutionLabel)
    resolutionContainer.appendChild(resolutionSelect)
    panel.appendChild(resolutionContainer)

    // FPS Limit dropdown
    const fpsContainer = document.createElement('div')
    fpsContainer.style.marginBottom = '1.5rem'
    fpsContainer.style.display = 'flex'
    fpsContainer.style.alignItems = 'center'
    fpsContainer.style.justifyContent = 'space-between'

    const fpsLabel = document.createElement('label')
    fpsLabel.textContent = 'FPS Limit'
    fpsLabel.style.fontSize = '0.9rem'
    fpsLabel.htmlFor = 'fps-limit-select'

    const fpsSelect = document.createElement('select')
    fpsSelect.id = 'fps-limit-select'
    fpsSelect.style.padding = '0.4rem 0.6rem'
    fpsSelect.style.background = 'rgba(50, 50, 50, 0.9)'
    fpsSelect.style.border = '2px solid rgba(255, 255, 255, 0.3)'
    fpsSelect.style.borderRadius = '4px'
    fpsSelect.style.color = 'rgba(255, 255, 255, 0.9)'
    fpsSelect.style.fontSize = '0.9rem'
    fpsSelect.style.cursor = 'pointer'

    const fpsOptions: { value: FramerateLimit; label: string }[] = [
      { value: 30, label: '30 FPS' },
      { value: 60, label: '60 FPS' },
      { value: 80, label: '80 FPS' },
      { value: 120, label: '120 FPS' },
      { value: 240, label: '240 FPS' },
    ]

    for (const opt of fpsOptions) {
      const option = document.createElement('option')
      option.value = String(opt.value)
      option.textContent = opt.label
      option.style.background = 'rgba(30, 30, 30, 1)'
      if (opt.value === graphicsSettings.framerateLimit) {
        option.selected = true
      }
      fpsSelect.appendChild(option)
    }

    fpsSelect.addEventListener('change', () => {
      const limit = parseInt(fpsSelect.value, 10) as FramerateLimit
      graphicsSettings.framerateLimit = limit
      options.onFramerateLimitChange?.(limit)
    })

    fpsContainer.appendChild(fpsLabel)
    fpsContainer.appendChild(fpsSelect)
    panel.appendChild(fpsContainer)

    // Culling toggle
    const cullingContainer = document.createElement('div')
    cullingContainer.style.marginBottom = '1.5rem'
    cullingContainer.style.display = 'flex'
    cullingContainer.style.alignItems = 'center'
    cullingContainer.style.justifyContent = 'space-between'

    const cullingLabel = document.createElement('label')
    cullingLabel.textContent = 'Culling Enabled'
    cullingLabel.style.fontSize = '0.9rem'
    cullingLabel.style.cursor = 'pointer'

    const cullingToggle = document.createElement('input')
    cullingToggle.type = 'checkbox'
    cullingToggle.checked = graphicsSettings.cullingEnabled
    cullingToggle.style.width = '18px'
    cullingToggle.style.height = '18px'
    cullingToggle.style.cursor = 'pointer'
    cullingToggle.style.accentColor = 'rgba(100, 180, 255, 0.9)'

    cullingLabel.htmlFor = 'culling-toggle'
    cullingToggle.id = 'culling-toggle'

    cullingToggle.addEventListener('change', () => {
      graphicsSettings.cullingEnabled = cullingToggle.checked
    })

    cullingContainer.appendChild(cullingLabel)
    cullingContainer.appendChild(cullingToggle)
    panel.appendChild(cullingContainer)

    // Shadows toggle
    const shadowsContainer = document.createElement('div')
    shadowsContainer.style.marginBottom = '1.5rem'
    shadowsContainer.style.display = 'flex'
    shadowsContainer.style.alignItems = 'center'
    shadowsContainer.style.justifyContent = 'space-between'

    const shadowsLabel = document.createElement('label')
    shadowsLabel.textContent = 'Shadows'
    shadowsLabel.style.fontSize = '0.9rem'
    shadowsLabel.style.cursor = 'pointer'
    shadowsLabel.htmlFor = 'shadows-toggle'

    const shadowsToggle = document.createElement('input')
    shadowsToggle.type = 'checkbox'
    shadowsToggle.id = 'shadows-toggle'
    shadowsToggle.checked = graphicsSettings.shadowsEnabled
    shadowsToggle.style.width = '18px'
    shadowsToggle.style.height = '18px'
    shadowsToggle.style.cursor = 'pointer'
    shadowsToggle.style.accentColor = 'rgba(100, 180, 255, 0.9)'

    shadowsContainer.appendChild(shadowsLabel)
    shadowsContainer.appendChild(shadowsToggle)
    panel.appendChild(shadowsContainer)

    // Shadow Quality dropdown (only visible when shadows enabled)
    const shadowQualityContainer = document.createElement('div')
    shadowQualityContainer.style.marginBottom = '1.5rem'
    shadowQualityContainer.style.display = graphicsSettings.shadowsEnabled ? 'flex' : 'none'
    shadowQualityContainer.style.alignItems = 'center'
    shadowQualityContainer.style.justifyContent = 'space-between'

    const shadowQualityLabel = document.createElement('label')
    shadowQualityLabel.textContent = 'Shadow Quality'
    shadowQualityLabel.style.fontSize = '0.9rem'
    shadowQualityLabel.htmlFor = 'shadow-quality-select'

    const shadowQualitySelect = document.createElement('select')
    shadowQualitySelect.id = 'shadow-quality-select'
    shadowQualitySelect.style.padding = '0.4rem 0.6rem'
    shadowQualitySelect.style.background = 'rgba(50, 50, 50, 0.9)'
    shadowQualitySelect.style.border = '2px solid rgba(255, 255, 255, 0.3)'
    shadowQualitySelect.style.borderRadius = '4px'
    shadowQualitySelect.style.color = 'rgba(255, 255, 255, 0.9)'
    shadowQualitySelect.style.fontSize = '0.9rem'
    shadowQualitySelect.style.cursor = 'pointer'

    const shadowQualityOptions: { value: ShadowMapSize; label: string }[] = [
      { value: 1024, label: 'Low' },
      { value: 2048, label: 'Medium' },
      { value: 4096, label: 'High' },
      { value: 8192, label: 'Ultra' },
    ]

    for (const opt of shadowQualityOptions) {
      const option = document.createElement('option')
      option.value = String(opt.value)
      option.textContent = opt.label
      option.style.background = 'rgba(30, 30, 30, 1)'
      if (opt.value === graphicsSettings.shadowMapSize) {
        option.selected = true
      }
      shadowQualitySelect.appendChild(option)
    }

    shadowsToggle.addEventListener('change', () => {
      graphicsSettings.shadowsEnabled = shadowsToggle.checked
      shadowQualityContainer.style.display = shadowsToggle.checked ? 'flex' : 'none'
      options.onShadowsEnabledChange?.(shadowsToggle.checked)
    })

    shadowQualitySelect.addEventListener('change', () => {
      const size = parseInt(shadowQualitySelect.value, 10) as ShadowMapSize
      graphicsSettings.shadowMapSize = size
      options.onShadowMapSizeChange?.(size)
    })

    shadowQualityContainer.appendChild(shadowQualityLabel)
    shadowQualityContainer.appendChild(shadowQualitySelect)
    panel.appendChild(shadowQualityContainer)

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

