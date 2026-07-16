export interface FpsCounterOptions {
  updateIntervalMs?: number
  color?: string
  fontSize?: string
}

export interface FrameMetrics {
  deltaTime: number
  cpuTime: number
  tickCount: number
}

export interface LightingStats {
  queued: number
  processing: number
}

export interface OcclusionStats {
  occluderCount: number
  candidateCount: number
  occludedCount: number
}

export interface SchedulerStats {
  tasksExecuted: number
  tasksSkipped: number
  budgetUsedMs: number
  currentBudgetMs: number
  avgFrameTimeMs: number
}

export interface RendererStats {
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  sceneObjects: number
}

export interface LiquidPhysicsStats {
  columnsProcessed: number
  columnsQueued: number
}

export interface EntityStats {
  activeCount: number
  pendingRemovalCount: number
}

export interface BiomeMiniMapData {
  grid: string[][] // 5x5 grid of 3-letter abbreviations (unrotated, north at top)
  yaw: number // Player yaw in radians (0 = north/-Z, positive = counter-clockwise)
}

export interface FpsCounterUI {
  readonly element: HTMLDivElement
  update(metrics: FrameMetrics): void
  setRenderResolution(width: number, height: number): void
  setPlayerPosition(x: number, y: number, z: number): void
  setLightingStats(stats: LightingStats): void
  setOcclusionStats(stats: OcclusionStats): void
  setSchedulerStats(stats: SchedulerStats): void
  setRendererStats(stats: RendererStats): void
  setLiquidPhysicsStats(stats: LiquidPhysicsStats): void
  setEntityStats(stats: EntityStats): void
  setBiomeMiniMap(data: BiomeMiniMapData): void
  show(): void
  hide(): void
  toggle(): boolean
  readonly visible: boolean
  destroy(): void
}

/**
 * Format large numbers with K/M suffix.
 */
function formatCount(n: number): string {
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(1) + 'M'
  }
  if (n >= 1_000) {
    return (n / 1_000).toFixed(1) + 'K'
  }
  return n.toString()
}

/**
 * Creates a performance stats display fixed at the top-right corner of the screen.
 * Shows FPS, frame time, and CPU busy time.
 * Implemented as a simple DOM overlay above the WebGL canvas.
 */
export function createFpsCounterUI(
  parent: HTMLElement = document.body,
  options: FpsCounterOptions = {}
): FpsCounterUI {
  const updateInterval = options.updateIntervalMs ?? 500
  const color = options.color ?? '#ffffff'
  const fontSize = options.fontSize ?? '13px'

  const el = document.createElement('div')
  el.style.position = 'fixed'
  el.style.top = '10px'
  el.style.right = '10px'
  el.style.fontFamily = 'monospace'
  el.style.fontSize = fontSize
  el.style.color = color
  el.style.textShadow = '0 0 4px rgba(0, 0, 0, 0.8)'
  el.style.pointerEvents = 'none'
  el.style.zIndex = '30'
  el.style.userSelect = 'none'
  el.style.textAlign = 'right'
  el.style.lineHeight = '1.4'
  el.innerHTML = 'FPS: --<br>UPS: --<br>Frame: --<br>CPU: --'

  parent.appendChild(el)

  // Create biome mini-map element (top-left corner)
  const miniMapEl = document.createElement('div')
  miniMapEl.style.cssText = `
    position: fixed;
    top: 10px;
    left: 10px;
    font-family: monospace;
    font-size: 12px;
    color: #ffffff;
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
    pointer-events: none;
    z-index: 30;
    user-select: none;
    line-height: 1.3;
    white-space: pre;
  `
  parent.appendChild(miniMapEl)

  let isVisible = true

  let frameCount = 0
  let elapsedTime = 0
  let totalCpuTime = 0
  let totalTickCount = 0
  let renderWidth = 0
  let renderHeight = 0
  let playerX = 0
  let playerY = 0
  let playerZ = 0
  let lightingStats: LightingStats | null = null
  let occlusionStats: OcclusionStats | null = null
  let schedulerStats: SchedulerStats | null = null
  let rendererStats: RendererStats | null = null
  let liquidPhysicsStats: LiquidPhysicsStats | null = null
  let liquidColumnsProcessedTotal = 0
  let entityStats: EntityStats | null = null

  // Change-detection caches so we only touch the DOM when rendered text differs
  let lastStatsHtml = ''
  let lastMiniMapHtml = ''
  let lastMiniMapGrid: string[][] | null = null
  let lastMiniMapRotationIndex = -1

  // Target frame budget for 60 FPS
  const frameBudgetMs = 16.67

  return {
    element: el,

    update(metrics: FrameMetrics): void {
      frameCount++
      const deltaMs = metrics.deltaTime * 1000
      elapsedTime += deltaMs
      totalCpuTime += metrics.cpuTime
      totalTickCount += metrics.tickCount

      if (elapsedTime >= updateInterval) {
        // Skip all string building and DOM work while hidden
        if (!isVisible) {
          frameCount = 0
          elapsedTime = 0
          totalCpuTime = 0
          totalTickCount = 0
          liquidColumnsProcessedTotal = 0
          return
        }
        const fps = Math.round((frameCount / elapsedTime) * 1000)
        const ups = Math.round((totalTickCount / elapsedTime) * 1000)
        const avgFrameTime = elapsedTime / frameCount
        const avgCpuTime = totalCpuTime / frameCount
        const headroom = Math.max(0, frameBudgetMs - avgCpuTime)
        const cpuPercent = Math.min(100, (avgCpuTime / frameBudgetMs) * 100)

        const posLine = `X: <span style="color:#00ff00">${playerX.toFixed(1)}</span>  Y: <span style="color:#ff0000">${playerY.toFixed(1)}</span>  Z: <span style="color:#ffff00">${playerZ.toFixed(1)}</span>`
        const lines = [
          posLine,
          `FPS: ${fps}`,
          `UPS: ${ups}`,
          `Frame: ${avgFrameTime.toFixed(1)}ms`,
          `CPU: ${avgCpuTime.toFixed(2)}ms (${cpuPercent.toFixed(0)}%)`,
          `Headroom: ${headroom.toFixed(1)}ms`,
        ]
        if (renderWidth > 0 && renderHeight > 0) {
          lines.push(`Render: ${renderWidth}x${renderHeight}`)
        }
        if (lightingStats) {
          lines.push(`Light: ${lightingStats.queued} queued, ${lightingStats.processing} active`)
        }
        if (occlusionStats && occlusionStats.candidateCount > 0) {
          const cullPercent = Math.round((occlusionStats.occludedCount / occlusionStats.candidateCount) * 100)
          lines.push(`Occlusion: ${occlusionStats.occludedCount}/${occlusionStats.candidateCount} culled (${cullPercent}%)`)
          lines.push(`Occluders: ${occlusionStats.occluderCount}`)
        }
        if (schedulerStats) {
          const total = schedulerStats.tasksExecuted + schedulerStats.tasksSkipped
          const skipColor = schedulerStats.tasksSkipped > 0 ? '#ffaa00' : '#00ff00'
          lines.push(`Tasks: ${schedulerStats.tasksExecuted}/${total} <span style="color:${skipColor}">(${schedulerStats.tasksSkipped} skipped)</span>`)
          lines.push(`Budget: ${schedulerStats.budgetUsedMs.toFixed(2)}/${schedulerStats.currentBudgetMs.toFixed(1)}ms`)
        }
        if (rendererStats) {
          const drawColor = rendererStats.drawCalls < 800 ? '#00ff00' : rendererStats.drawCalls < 1200 ? '#ffaa00' : '#ff4444'
          lines.push(`Draws: <span style="color:${drawColor}">${rendererStats.drawCalls}</span>`)
          lines.push(`Tris: ${formatCount(rendererStats.triangles)}`)
          lines.push(`Geo/Tex: ${rendererStats.geometries} / ${rendererStats.textures}`)
          // Scene objects count - helps debug updateMatrixWorld performance
          const objColor = rendererStats.sceneObjects < 12000 ? '#00ff00' : rendererStats.sceneObjects < 20000 ? '#ffaa00' : '#ff4444'
          lines.push(`SceneObj: <span style="color:${objColor}">${rendererStats.sceneObjects}</span>`)
        }
        if (liquidPhysicsStats) {
          const columnsPerSec = Math.round((liquidColumnsProcessedTotal / elapsedTime) * 1000)
          lines.push(`Liquid: ${columnsPerSec}/s (${liquidPhysicsStats.columnsQueued} queued)`)
          liquidColumnsProcessedTotal = 0
        }
        if (entityStats) {
          const pendingColor = entityStats.pendingRemovalCount > 0 ? '#ffaa00' : '#00ff00'
          lines.push(`Entities: ${entityStats.activeCount} <span style="color:${pendingColor}">(${entityStats.pendingRemovalCount} pending delete)</span>`)
        }
        const statsHtml = lines.join('<br>')
        if (statsHtml !== lastStatsHtml) {
          el.innerHTML = statsHtml
          lastStatsHtml = statsHtml
        }

        frameCount = 0
        elapsedTime = 0
        totalCpuTime = 0
        totalTickCount = 0
      }
    },

    setRenderResolution(width: number, height: number): void {
      renderWidth = width
      renderHeight = height
    },

    setPlayerPosition(x: number, y: number, z: number): void {
      playerX = x
      playerY = y
      playerZ = z
    },

    setLightingStats(stats: LightingStats): void {
      lightingStats = stats
    },

    setOcclusionStats(stats: OcclusionStats): void {
      occlusionStats = stats
    },

    setSchedulerStats(stats: SchedulerStats): void {
      schedulerStats = stats
    },

    setRendererStats(stats: RendererStats): void {
      rendererStats = stats
    },

    setLiquidPhysicsStats(stats: LiquidPhysicsStats): void {
      liquidColumnsProcessedTotal += stats.columnsProcessed
      liquidPhysicsStats = stats
    },

    setEntityStats(stats: EntityStats): void {
      entityStats = stats
    },

    setBiomeMiniMap(data: BiomeMiniMapData): void {
      if (!isVisible) return
      if (!data.grid || data.grid.length !== 5) return

      // Normalize yaw to [0, 2π) and determine rotation index (0-3)
      // yaw=0 is North, increases counter-clockwise (π/2=West, π=South, 3π/2=East)
      const TWO_PI = 2 * Math.PI
      const normalizedYaw = ((data.yaw % TWO_PI) + TWO_PI) % TWO_PI
      const rotationIndex = Math.round(normalizedYaw / (Math.PI / 2)) % 4

      // The rendered map only changes when the grid (region/layer) or the yaw
      // quadrant changes; skip the closure/string rebuild otherwise. Callers pass
      // a stable grid reference that is only reallocated when the region changes.
      if (data.grid === lastMiniMapGrid && rotationIndex === lastMiniMapRotationIndex) return
      lastMiniMapGrid = data.grid
      lastMiniMapRotationIndex = rotationIndex

      // Get rotated cell value based on rotation index
      // 0: no rotation (North at top)
      // 1: 90° CW (West at top)
      // 2: 180° (South at top)
      // 3: 270° CW (East at top)
      const getRotatedCell = (row: number, col: number): string => {
        let srcRow: number, srcCol: number
        switch (rotationIndex) {
          case 1: // 90° CW: new[row][col] = old[4-col][row]
            srcRow = 4 - col
            srcCol = row
            break
          case 2: // 180°: new[row][col] = old[4-row][4-col]
            srcRow = 4 - row
            srcCol = 4 - col
            break
          case 3: // 270° CW: new[row][col] = old[col][4-row]
            srcRow = col
            srcCol = 4 - row
            break
          default: // 0: no rotation
            srcRow = row
            srcCol = col
        }
        return data.grid[srcRow]?.[srcCol] || '???'
      }

      const lines: string[] = []
      for (let row = 0; row < 5; row++) {
        const cells: string[] = []
        for (let col = 0; col < 5; col++) {
          const abbr = getRotatedCell(row, col)
          // Highlight center cell (player's current biome) - always at [2][2]
          if (row === 2 && col === 2) {
            cells.push(`<span style="color:#00ffff">${abbr}</span>`)
          } else {
            cells.push(abbr)
          }
        }
        lines.push(cells.join(' '))
      }
      const miniMapHtml = lines.join('\n')
      if (miniMapHtml !== lastMiniMapHtml) {
        miniMapEl.innerHTML = miniMapHtml
        lastMiniMapHtml = miniMapHtml
      }
    },

    show(): void {
      el.style.display = 'block'
      miniMapEl.style.display = 'block'
      isVisible = true
    },

    hide(): void {
      el.style.display = 'none'
      miniMapEl.style.display = 'none'
      isVisible = false
    },

    toggle(): boolean {
      if (isVisible) {
        this.hide()
      } else {
        this.show()
      }
      return isVisible
    },

    get visible(): boolean {
      return isVisible
    },

    destroy(): void {
      if (el.parentElement === parent) {
        parent.removeChild(el)
      }
      if (miniMapEl.parentElement === parent) {
        parent.removeChild(miniMapEl)
      }
    },
  }
}

