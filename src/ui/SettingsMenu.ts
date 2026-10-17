import { applyUIScale } from './uiScale.ts'
import { MAX_CHUNK_DISTANCE, type GenerationConfig } from '../world/generate/GenerationConfig.ts'
import { LOD_DISTANCE_OPTIONS, type GraphicsSettings, type ResolutionPreset, type FramerateLimit, type ShadowMapSize, type LodDistance, type TextureFiltering } from '../settings/index.ts'
import { LOD_MIN_MARGIN_CHUNKS } from '../world/lod/LodTypes.ts'
import type { AudioSettingKey, AudioSettings } from '../audio/AudioSettings.ts'
import { playSound } from '../audio/SoundHooks.ts'

export type SettingsPage = 'main' | 'config' | 'audio'

export interface SettingsMenuUIOptions {
  /** Called when the user clicks "Resume Game" */
  onResume?: () => void
  /** Called when chunk distance setting changes */
  onChunkDistanceChange?: (value: number) => void
  /** Called when the far terrain (LOD) setting changes */
  onFarTerrainChange?: (enabled: boolean, distance: LodDistance) => void
  /** Called when resolution setting changes */
  onResolutionChange?: (preset: ResolutionPreset) => void
  /** Called when framerate limit setting changes */
  onFramerateLimitChange?: (limit: FramerateLimit) => void
  /** Called when shadows enabled setting changes */
  onShadowsEnabledChange?: (enabled: boolean) => void
  /** Called when shadow map size setting changes */
  onShadowMapSizeChange?: (size: ShadowMapSize) => void
  /** Called when the texture filtering setting changes */
  onTextureFilteringChange?: (mode: TextureFiltering) => void
  /** Called when the user clicks "Save Game" - returns a promise that resolves when save is complete */
  onSave?: () => Promise<void>
  /** Called when the user confirms "New Game" - should clear saved data and reload */
  onNewGame?: () => Promise<void>
  /** Volume sliders (Audio page); the page is hidden without it */
  audioSettings?: AudioSettings
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
  applyUIScale(panel)

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
    button.addEventListener('click', () => {
      playSound('ui.click')
      onClick()
    })

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

    // Save Game button (only shown if onSave callback is provided)
    if (options.onSave) {
      let isSaving = false
      const saveBtn = createButton('Save Game', async () => {
        if (isSaving) return
        isSaving = true
        const originalText = saveBtn.textContent
        saveBtn.textContent = 'Saving...'
        saveBtn.style.opacity = '0.7'
        saveBtn.style.cursor = 'wait'

        try {
          await options.onSave!()
          saveBtn.textContent = 'Saved!'
          saveBtn.style.background = 'rgba(40, 100, 40, 0.9)'
          saveBtn.style.borderColor = 'rgba(100, 200, 100, 0.5)'

          // Reset after 1.5 seconds
          setTimeout(() => {
            saveBtn.textContent = originalText
            saveBtn.style.background = 'rgba(50, 50, 50, 0.9)'
            saveBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)'
            saveBtn.style.opacity = '1'
            saveBtn.style.cursor = 'pointer'
            isSaving = false
          }, 1500)
        } catch (error) {
          console.error('Save failed:', error)
          saveBtn.textContent = 'Save Failed'
          saveBtn.style.background = 'rgba(120, 40, 40, 0.9)'
          saveBtn.style.borderColor = 'rgba(255, 100, 100, 0.5)'

          // Reset after 2 seconds
          setTimeout(() => {
            saveBtn.textContent = originalText
            saveBtn.style.background = 'rgba(50, 50, 50, 0.9)'
            saveBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)'
            saveBtn.style.opacity = '1'
            saveBtn.style.cursor = 'pointer'
            isSaving = false
          }, 2000)
        }
      })
      panel.appendChild(saveBtn)
    }

    const settingsBtn = createButton('Settings', () => {
      renderConfigPage()
    })
    panel.appendChild(settingsBtn)

    if (options.audioSettings) {
      const audioBtn = createButton('Audio', () => {
        renderAudioPage()
      })
      panel.appendChild(audioBtn)
    }

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

    let isStarting = false
    const confirmBtn = createButton('Start New World', async () => {
      if (isStarting) return
      isStarting = true
      confirmBtn.textContent = 'Starting...'
      confirmBtn.style.opacity = '0.7'
      confirmBtn.style.cursor = 'wait'

      try {
        // Clear saved data if callback provided
        if (options.onNewGame) {
          await options.onNewGame()
        } else {
          // Fallback: just regenerate seed and reload
          config.regenerateSeed()
          window.location.reload()
        }
      } catch (error) {
        console.error('Failed to start new game:', error)
        confirmBtn.textContent = 'Failed!'
        isStarting = false
      }
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
    slider.max = String(MAX_CHUNK_DISTANCE)
    slider.value = String(config.chunkDistance)
    slider.style.width = '100%'
    slider.style.cursor = 'pointer'

    sliderContainer.appendChild(sliderLabel)
    sliderContainer.appendChild(slider)
    panel.appendChild(sliderContainer)

    // Far Terrain dropdown: Off, or an LOD distance beyond the render distance
    const farTerrainContainer = document.createElement('div')
    farTerrainContainer.style.marginBottom = '1.5rem'
    farTerrainContainer.style.display = 'flex'
    farTerrainContainer.style.alignItems = 'center'
    farTerrainContainer.style.justifyContent = 'space-between'

    const farTerrainLabel = document.createElement('label')
    farTerrainLabel.textContent = 'Far Terrain'
    farTerrainLabel.style.fontSize = '0.9rem'
    farTerrainLabel.htmlFor = 'far-terrain-select'

    const farTerrainSelect = document.createElement('select')
    farTerrainSelect.id = 'far-terrain-select'
    farTerrainSelect.style.padding = '0.4rem 0.6rem'
    farTerrainSelect.style.background = 'rgba(50, 50, 50, 0.9)'
    farTerrainSelect.style.border = '2px solid rgba(255, 255, 255, 0.3)'
    farTerrainSelect.style.borderRadius = '4px'
    farTerrainSelect.style.color = 'rgba(255, 255, 255, 0.9)'
    farTerrainSelect.style.fontSize = '0.9rem'
    farTerrainSelect.style.cursor = 'pointer'

    const FAR_TERRAIN_OFF = 'off'
    const addFarTerrainOption = (value: string, label: string): void => {
      const option = document.createElement('option')
      option.value = value
      option.textContent = label
      option.style.background = 'rgba(30, 30, 30, 1)'
      farTerrainSelect.appendChild(option)
    }

    // Offer only distances beyond the render distance. A stored distance the
    // render distance has caught up with is shown as the nearest valid one
    // (LodManager.getDistance applies the same minimum at runtime) but never
    // overwritten: dragging the render distance up and back down keeps it.
    const refreshFarTerrainOptions = (): void => {
      const minDistance = config.chunkDistance + LOD_MIN_MARGIN_CHUNKS
      const choices = LOD_DISTANCE_OPTIONS.filter((distance) => distance >= minDistance)
      farTerrainSelect.innerHTML = ''
      addFarTerrainOption(FAR_TERRAIN_OFF, 'Off')
      for (const distance of choices) {
        addFarTerrainOption(String(distance), `${distance} chunks`)
      }
      const shownDistance = choices.length > 0 ? Math.max(graphicsSettings.lodDistance, choices[0]) : graphicsSettings.lodDistance
      farTerrainSelect.value = graphicsSettings.lodEnabled ? String(shownDistance) : FAR_TERRAIN_OFF
    }
    refreshFarTerrainOptions()

    farTerrainSelect.addEventListener('change', () => {
      const value = farTerrainSelect.value
      graphicsSettings.lodEnabled = value !== FAR_TERRAIN_OFF
      if (value !== FAR_TERRAIN_OFF) {
        graphicsSettings.lodDistance = parseInt(value, 10) as LodDistance
      }
      options.onFarTerrainChange?.(graphicsSettings.lodEnabled, graphicsSettings.lodDistance)
    })

    farTerrainContainer.appendChild(farTerrainLabel)
    farTerrainContainer.appendChild(farTerrainSelect)
    panel.appendChild(farTerrainContainer)

    slider.addEventListener('input', () => {
      const value = parseInt(slider.value, 10)
      valueDisplay.textContent = String(value)
      config.chunkDistance = value
      options.onChunkDistanceChange?.(value)
      refreshFarTerrainOptions()
    })

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

    // Texture Filtering dropdown: crisp pixel art or smooth (trilinear)
    const filteringContainer = document.createElement('div')
    filteringContainer.style.marginBottom = '1.5rem'
    filteringContainer.style.display = 'flex'
    filteringContainer.style.alignItems = 'center'
    filteringContainer.style.justifyContent = 'space-between'

    const filteringLabel = document.createElement('label')
    filteringLabel.textContent = 'Texture Filtering'
    filteringLabel.style.fontSize = '0.9rem'
    filteringLabel.htmlFor = 'texture-filtering-select'

    const filteringSelect = document.createElement('select')
    filteringSelect.id = 'texture-filtering-select'
    filteringSelect.style.padding = '0.4rem 0.6rem'
    filteringSelect.style.background = 'rgba(50, 50, 50, 0.9)'
    filteringSelect.style.border = '2px solid rgba(255, 255, 255, 0.3)'
    filteringSelect.style.borderRadius = '4px'
    filteringSelect.style.color = 'rgba(255, 255, 255, 0.9)'
    filteringSelect.style.fontSize = '0.9rem'
    filteringSelect.style.cursor = 'pointer'

    const filteringOptions: { value: TextureFiltering; label: string }[] = [
      { value: 'crisp', label: 'Crisp' },
      { value: 'smooth', label: 'Smooth' },
    ]
    for (const opt of filteringOptions) {
      const option = document.createElement('option')
      option.value = opt.value
      option.textContent = opt.label
      option.style.background = 'rgba(30, 30, 30, 1)'
      if (opt.value === graphicsSettings.textureFiltering) {
        option.selected = true
      }
      filteringSelect.appendChild(option)
    }

    filteringSelect.addEventListener('change', () => {
      const mode = filteringSelect.value as TextureFiltering
      graphicsSettings.textureFiltering = mode
      options.onTextureFilteringChange?.(mode)
    })

    filteringContainer.appendChild(filteringLabel)
    filteringContainer.appendChild(filteringSelect)
    panel.appendChild(filteringContainer)

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
      { value: 9999, label: 'Unlimited' },
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

  const renderAudioPage = (): void => {
    const audio = options.audioSettings
    if (!audio) return
    panel.innerHTML = ''
    currentPage = 'audio'

    const title = document.createElement('h2')
    title.textContent = 'Audio'
    title.style.margin = '0 0 1.5rem 0'
    title.style.fontSize = '1.5rem'
    title.style.fontWeight = '600'
    title.style.textAlign = 'center'
    panel.appendChild(title)

    const volumes: Array<[AudioSettingKey, string]> = [
      ['master', 'Master Volume'],
      ['music', 'Music'],
      ['effects', 'Sound Effects'],
      ['ambience', 'Ambience'],
    ]
    for (const [key, label] of volumes) {
      const container = document.createElement('div')
      container.style.marginBottom = '1.5rem'

      const sliderLabel = document.createElement('label')
      sliderLabel.style.display = 'flex'
      sliderLabel.style.justifyContent = 'space-between'
      sliderLabel.style.marginBottom = '0.5rem'
      sliderLabel.style.fontSize = '0.9rem'

      const labelText = document.createElement('span')
      labelText.textContent = label

      const valueDisplay = document.createElement('span')
      valueDisplay.textContent = `${audio.get(key)}%`
      valueDisplay.style.color = 'rgba(255, 255, 255, 0.7)'

      sliderLabel.appendChild(labelText)
      sliderLabel.appendChild(valueDisplay)

      const slider = document.createElement('input')
      slider.type = 'range'
      slider.min = '0'
      slider.max = '100'
      slider.step = '5'
      slider.value = String(audio.get(key))
      slider.style.width = '100%'
      slider.style.cursor = 'pointer'
      slider.addEventListener('input', () => {
        const value = parseInt(slider.value, 10)
        valueDisplay.textContent = `${value}%`
        audio.set(key, value)
      })
      // A tick on release previews the new effects level
      slider.addEventListener('change', () => playSound('ui.click'))

      container.appendChild(sliderLabel)
      container.appendChild(slider)
      panel.appendChild(container)
    }

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

