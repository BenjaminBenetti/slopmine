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

export interface FpsCounterUI {
  readonly element: HTMLDivElement
  update(metrics: FrameMetrics): void
  setRenderResolution(width: number, height: number): void
  setPlayerPosition(x: number, y: number, z: number): void
  setLightingStats(stats: LightingStats): void
  setOcclusionStats(stats: OcclusionStats): void
  setSchedulerStats(stats: SchedulerStats): void
  show(): void
  hide(): void
  toggle(): boolean
  readonly visible: boolean
  destroy(): void
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
        el.innerHTML = lines.join('<br>')

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

    show(): void {
      el.style.display = 'block'
      isVisible = true
    },

    hide(): void {
      el.style.display = 'none'
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
    },
  }
}

