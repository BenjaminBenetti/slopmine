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

// Block colors for the falling effect - earth and water themed
const BLOCK_COLORS = [
  // Earth tones
  '#5d4037', // Dark brown (dirt)
  '#6d4c41', // Medium brown
  '#795548', // Light brown
  '#4e342e', // Deep brown
  '#3e2723', // Dark earth
  // Grass/vegetation
  '#558b2f', // Grass green
  '#689f38', // Light grass
  '#33691e', // Dark grass
  // Stone
  '#757575', // Gray stone
  '#616161', // Dark stone
  '#9e9e9e', // Light stone
  // Water
  '#1565c0', // Deep water
  '#1976d2', // Medium water
  '#2196f3', // Light water
  '#0d47a1', // Dark water
  // Sand
  '#d7ccc8', // Light sand
  '#bcaaa4', // Medium sand
]

/**
 * Creates and manages the bottom-up block fill effect
 */
function createFallingBlocksEffect(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  let currentFillTarget = 0
  let animationId: number | null = null

  const BLOCK_SIZE = 96

  // Grid-based storage: grid[col][row] = color or null
  let grid: (string | null)[][] = []
  let cols = 0
  let rows = 0

  function resize() {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    cols = Math.ceil(canvas.width / BLOCK_SIZE)
    rows = Math.ceil(canvas.height / BLOCK_SIZE)

    // Reinitialize grid
    grid = []
    for (let c = 0; c < cols; c++) {
      grid[c] = []
      for (let r = 0; r < rows; r++) {
        grid[c][r] = null
      }
    }
  }

  function getRandomColor(): string {
    return BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)]
  }

  function getColumnHeight(col: number): number {
    for (let r = 0; r < rows; r++) {
      if (grid[col][r] !== null) {
        return rows - r
      }
    }
    return 0
  }

  function getTotalBlocks(): number {
    let count = 0
    for (let c = 0; c < cols; c++) {
      count += getColumnHeight(c)
    }
    return count
  }

  function getTargetBlocks(): number {
    return Math.floor(cols * rows * currentFillTarget)
  }

  function findNextColumn(): number | null {
    // Find the shortest column(s) to fill from bottom up evenly
    let minHeight = rows + 1
    const shortestCols: number[] = []

    for (let c = 0; c < cols; c++) {
      const h = getColumnHeight(c)
      if (h < rows) {
        if (h < minHeight) {
          minHeight = h
          shortestCols.length = 0
          shortestCols.push(c)
        } else if (h === minHeight) {
          shortestCols.push(c)
        }
      }
    }

    if (shortestCols.length === 0) return null
    return shortestCols[Math.floor(Math.random() * shortestCols.length)]
  }

  function animate() {
    // Clear canvas
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Place blocks to match target
    const targetBlocks = getTargetBlocks()
    while (getTotalBlocks() < targetBlocks) {
      const col = findNextColumn()
      if (col === null) break
      const colHeight = getColumnHeight(col)
      const targetRow = rows - colHeight - 1
      if (targetRow >= 0) {
        grid[col][targetRow] = getRandomColor()
      }
    }

    // Draw blocks
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const color = grid[c][r]
        if (color !== null) {
          const x = c * BLOCK_SIZE
          const y = r * BLOCK_SIZE

          // Main block face
          ctx.fillStyle = color
          ctx.fillRect(x, y, BLOCK_SIZE, BLOCK_SIZE)

          // Highlight (top-left)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
          ctx.fillRect(x, y, BLOCK_SIZE, 4)
          ctx.fillRect(x, y, 4, BLOCK_SIZE)

          // Shadow (bottom-right)
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
          ctx.fillRect(x, y + BLOCK_SIZE - 4, BLOCK_SIZE, 4)
          ctx.fillRect(x + BLOCK_SIZE - 4, y, 4, BLOCK_SIZE)

          // Inner border
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)'
          ctx.lineWidth = 1
          ctx.strokeRect(x + 0.5, y + 0.5, BLOCK_SIZE - 1, BLOCK_SIZE - 1)
        }
      }
    }

    animationId = requestAnimationFrame(animate)
  }

  resize()
  window.addEventListener('resize', resize)
  animate()

  return {
    setFillTarget(progress: number) {
      currentFillTarget = Math.min(1, Math.max(0, progress))
    },
    destroy() {
      if (animationId !== null) {
        cancelAnimationFrame(animationId)
      }
      window.removeEventListener('resize', resize)
    }
  }
}

/**
 * Creates a full-screen loading overlay with a progress bar.
 * Shows chunk loading progress before the player spawns.
 */
export function createLoadingScreenUI(
  parent: HTMLElement = document.body,
  options: LoadingScreenOptions = {}
): LoadingScreenUI {
  const barColor = options.barColor ?? '#4ade80'

  // Container
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    font-family: 'Segoe UI', system-ui, sans-serif;
    transition: opacity 0.3s ease-out;
  `

  // Canvas for falling blocks effect
  const canvas = document.createElement('canvas')
  canvas.style.cssText = `
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  `
  container.appendChild(canvas)

  // Initialize the falling blocks effect
  const blocksEffect = createFallingBlocksEffect(canvas)

  // Title - positioned above the canvas
  const title = document.createElement('div')
  title.textContent = 'Generating World...'
  title.style.cssText = `
    position: relative;
    z-index: 1;
    color: #ffffff;
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 32px;
    letter-spacing: 0.5px;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  `
  container.appendChild(title)

  // Progress bar container
  const barContainer = document.createElement('div')
  barContainer.style.cssText = `
    position: relative;
    z-index: 1;
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
    position: relative;
    z-index: 1;
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
      // Update the falling blocks fill target to match loading progress
      blocksEffect.setFillTarget(percent / 100)
    },

    hide(): void {
      container.style.opacity = '0'
      container.style.pointerEvents = 'none'
      // Remove from DOM after fade
      setTimeout(() => {
        container.style.display = 'none'
        blocksEffect.destroy()
      }, 300)
    },

    show(): void {
      container.style.display = 'flex'
      container.style.opacity = '1'
      container.style.pointerEvents = 'auto'
    },

    destroy(): void {
      blocksEffect.destroy()
      if (container.parentElement === parent) {
        parent.removeChild(container)
      }
    },
  }
}
