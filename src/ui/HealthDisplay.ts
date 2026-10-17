import { HudOrder, mountHudElement } from './hudLayout.ts'

export interface HealthDisplayOptions {
  heartSizePx?: number
  /** Hearts per row (the base 40 HP fill one row of 20) */
  heartCount?: number
  /** Most hearts ever shown (extra rows stack above the first; 30 = +20 max HP) */
  maxHeartCount?: number
}

export interface HealthDisplayUI {
  readonly root: HTMLDivElement
  /** Shows ceil(max / 2) hearts (up to maxHeartCount), filled by `current` */
  updateHealth(current: number, max: number): void
  flash(): void
  /** Attach a HUD row above the hearts (e.g. armor); it moves up with extra heart rows */
  attachAbove(element: HTMLElement): void
  destroy(): void
}

type HeartState = 'full' | 'half' | 'empty'

function getHeartState(heartIndex: number, currentHealth: number): HeartState {
  const heartHealthMin = heartIndex * 2
  if (currentHealth >= heartHealthMin + 2) return 'full'
  if (currentHealth >= heartHealthMin + 1) return 'half'
  return 'empty'
}

// Counter for unique gradient IDs
let heartIdCounter = 0

/** Full-heart gradient stops + stroke; bonus hearts (past the first row) burn ember-orange. */
interface HeartPalette {
  readonly fullStops: string
  readonly fullStroke: string
  readonly emptyStroke: string
}

const NORMAL_HEART: HeartPalette = {
  fullStops: `
        <stop offset="0%" stop-color="#ff4444"/>
        <stop offset="35%" stop-color="#e31b23"/>
        <stop offset="70%" stop-color="#c01018"/>
        <stop offset="100%" stop-color="#8a0a10"/>
      `,
  fullStroke: '#ff6666',
  emptyStroke: '#602020',
}

const INFERNAL_HEART: HeartPalette = {
  fullStops: `
        <stop offset="0%" stop-color="#ffb347"/>
        <stop offset="30%" stop-color="#ff6a1f"/>
        <stop offset="65%" stop-color="#c8201c"/>
        <stop offset="100%" stop-color="#6a0810"/>
      `,
  fullStroke: '#ffc46b',
  emptyStroke: '#7a3418',
}

/**
 * Creates a 3D-style heart element with gradients and shadows.
 */
function createHeart3D(size: number, palette: HeartPalette = NORMAL_HEART): {
  container: HTMLDivElement
  emptyHeart: HTMLDivElement
  filledHeart: HTMLDivElement
  halfHeart: HTMLDivElement
} {
  const container = document.createElement('div')
  container.style.position = 'relative'
  container.style.width = `${size}px`
  container.style.height = `${size}px`
  container.style.filter = 'drop-shadow(1px 2px 2px rgba(0, 0, 0, 0.5))'

  // SVG for proper heart shape with 3D appearance
  const createHeartSVG = (type: 'empty' | 'full'): HTMLDivElement => {
    const uniqueId = heartIdCounter++
    const wrapper = document.createElement('div')
    wrapper.style.position = 'absolute'
    wrapper.style.inset = '0'
    wrapper.style.transition = 'opacity 0.1s ease-out'

    // Gradient colors based on type
    let gradientColors: string
    let strokeColor: string
    let highlightOpacity: string

    if (type === 'empty') {
      gradientColors = `
        <stop offset="0%" stop-color="#4a2020"/>
        <stop offset="40%" stop-color="#2a1010"/>
        <stop offset="100%" stop-color="#1a0808"/>
      `
      strokeColor = palette.emptyStroke
      highlightOpacity = '0.15'
    } else {
      gradientColors = palette.fullStops
      strokeColor = palette.fullStroke
      highlightOpacity = '0.4'
    }

    const gradId = `hg_${type}_${uniqueId}`
    const highId = `hh_${type}_${uniqueId}`

    // Create SVG with gradient and highlight
    const svg = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
        <defs>
          <linearGradient id="${gradId}" x1="0%" y1="0%" x2="0%" y2="100%">
            ${gradientColors}
          </linearGradient>
          <radialGradient id="${highId}" cx="30%" cy="30%" r="50%">
            <stop offset="0%" stop-color="white" stop-opacity="${highlightOpacity}"/>
            <stop offset="100%" stop-color="white" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              fill="url(#${gradId})"
              stroke="${strokeColor}"
              stroke-width="0.5"/>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              fill="url(#${highId})"/>
      </svg>
    `

    wrapper.innerHTML = svg
    return wrapper
  }

  // Create half heart with clip
  const createHalfHeartSVG = (): HTMLDivElement => {
    const uniqueId = heartIdCounter++
    const wrapper = document.createElement('div')
    wrapper.style.position = 'absolute'
    wrapper.style.inset = '0'
    wrapper.style.transition = 'opacity 0.1s ease-out'
    wrapper.style.clipPath = 'inset(0 50% 0 0)'

    const gradId = `hg_half_${uniqueId}`
    const highId = `hh_half_${uniqueId}`

    const svg = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
        <defs>
          <linearGradient id="${gradId}" x1="0%" y1="0%" x2="0%" y2="100%">
            ${palette.fullStops}
          </linearGradient>
          <radialGradient id="${highId}" cx="30%" cy="30%" r="50%">
            <stop offset="0%" stop-color="white" stop-opacity="0.4"/>
            <stop offset="100%" stop-color="white" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              fill="url(#${gradId})"
              stroke="${palette.fullStroke}"
              stroke-width="0.5"/>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              fill="url(#${highId})"/>
      </svg>
    `

    wrapper.innerHTML = svg
    return wrapper
  }

  const emptyHeart = createHeartSVG('empty')
  const filledHeart = createHeartSVG('full')
  const halfHeart = createHalfHeartSVG()

  container.appendChild(emptyHeart)
  container.appendChild(filledHeart)
  container.appendChild(halfHeart)

  return { container, emptyHeart, filledHeart, halfHeart }
}

/**
 * Creates a health display with floating 3D hearts above the hotbar.
 * Each heart represents 2 health points.
 */
export function createHealthDisplayUI(
  parent: HTMLElement = document.body,
  options: HealthDisplayOptions = {}
): HealthDisplayUI {
  const heartSize = options.heartSizePx ?? 24
  const rowLength = options.heartCount ?? 20
  const maxHearts = Math.max(rowLength, options.maxHeartCount ?? 30)

  // Column, bottom-up: first heart row at the bottom, extra rows and
  // attached HUD rows (armor) stack above it, all left-aligned. Mounted at
  // the bottom of the HUD's bottom-centre column, right above the toolbar;
  // action-bar messages stack above it there.
  const root = document.createElement('div')
  root.style.display = 'flex'
  root.style.flexDirection = 'column-reverse'
  root.style.alignItems = 'flex-start'
  root.style.gap = '2px'
  root.style.pointerEvents = 'none'

  const hearts: Array<{
    container: HTMLDivElement
    emptyHeart: HTMLDivElement
    filledHeart: HTMLDivElement
    halfHeart: HTMLDivElement
  }> = []
  const rows: HTMLDivElement[] = []

  for (let i = 0; i < maxHearts; i++) {
    const rowIndex = Math.floor(i / rowLength)
    if (rowIndex >= rows.length) {
      const row = document.createElement('div')
      row.style.display = 'flex'
      row.style.gap = '3px'
      rows.push(row)
      root.appendChild(row)
    }
    const heart = createHeart3D(heartSize, rowIndex === 0 ? NORMAL_HEART : INFERNAL_HEART)
    hearts.push(heart)
    rows[rowIndex].appendChild(heart.container)
  }

  // HUD rows attached above the hearts (appended last = drawn on top)
  const aboveSlot = document.createElement('div')
  aboveSlot.style.display = 'flex'
  aboveSlot.style.flexDirection = 'column-reverse'
  aboveSlot.style.alignItems = 'flex-start'
  aboveSlot.style.gap = '2px'
  root.appendChild(aboveSlot)

  mountHudElement(root, 'bottomCenter', HudOrder.HEARTS, parent)

  /** Show ceil(max / 2) hearts; hide the rest and any empty extra row. */
  function updateHeartCount(max: number): void {
    const visible = Math.max(1, Math.min(maxHearts, Math.ceil(max / 2)))
    for (let i = 0; i < hearts.length; i++) {
      hearts[i].container.style.display = i < visible ? '' : 'none'
    }
    for (let r = 0; r < rows.length; r++) {
      rows[r].style.display = r * rowLength < visible ? 'flex' : 'none'
    }
  }

  function updateHeartVisuals(current: number): void {
    for (let i = 0; i < hearts.length; i++) {
      const state = getHeartState(i, current)
      const { filledHeart, halfHeart } = hearts[i]

      switch (state) {
        case 'full':
          filledHeart.style.opacity = '1'
          halfHeart.style.opacity = '0'
          break
        case 'half':
          filledHeart.style.opacity = '0'
          halfHeart.style.opacity = '1'
          break
        case 'empty':
          filledHeart.style.opacity = '0'
          halfHeart.style.opacity = '0'
          break
      }
    }
  }

  // Initialize with one full row
  updateHeartCount(rowLength * 2)
  updateHeartVisuals(rowLength * 2)

  // Track flash state for cleanup
  let flashTimeout: ReturnType<typeof setTimeout> | null = null

  return {
    root,

    updateHealth(current: number, max: number): void {
      updateHeartCount(max)
      updateHeartVisuals(current)
    },

    attachAbove(element: HTMLElement): void {
      aboveSlot.appendChild(element)
    },

    flash(): void {
      // Briefly scale up hearts and add glow for damage feedback
      if (flashTimeout) {
        clearTimeout(flashTimeout)
      }

      for (const heart of hearts) {
        heart.container.style.transform = 'scale(1.15)'
        heart.container.style.filter = 'drop-shadow(1px 2px 2px rgba(0, 0, 0, 0.5)) drop-shadow(0 0 4px rgba(255, 50, 50, 0.8))'
        heart.container.style.transition = 'transform 0.08s ease-out, filter 0.08s ease-out'
      }

      flashTimeout = setTimeout(() => {
        for (const heart of hearts) {
          heart.container.style.transform = 'scale(1)'
          heart.container.style.filter = 'drop-shadow(1px 2px 2px rgba(0, 0, 0, 0.5))'
        }
        flashTimeout = null
      }, 150)
    },

    destroy(): void {
      if (flashTimeout) {
        clearTimeout(flashTimeout)
      }
      root.remove()
    },
  }
}
