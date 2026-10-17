import { getHudTopBandBottom, HudOrder, mountHudElement, onHudLayout } from './hudLayout.ts'

/**
 * Screen-space notification toasts, stacked in the HUD's top-right column
 * (below the debug overlay while it is shown; up to 300 px wide, narrower on
 * small windows so they stay clear of the boss bar).
 *
 * Generic: any system can call `showToast({ title, body?, accent?, iconUrl? })`.
 * Toasts never take input (pointer-events: none), fade out on their own, and
 * at most {@link MAX_VISIBLE} show at once, and only as many as fit in the
 * HUD's top band (hearts and hotbar live below it) - the rest wait in a
 * queue, so a burst of notifications plays out instead of covering the
 * screen.
 */

export interface ToastOptions {
  /** Bold first line */
  title: string
  /** Optional second line (smaller, wraps) */
  body?: string
  /** CSS colour of the accent bar and title (default warm gold) */
  accent?: string
  /** Optional icon (item icon URL), drawn 36px at the left */
  iconUrl?: string
  /** How long the toast stays before fading (ms, default 5000) */
  durationMs?: number
  /** Optional small caption above the title (e.g. "Milestone") */
  caption?: string
}

const MAX_VISIBLE = 4
const DEFAULT_DURATION_MS = 5000
const FADE_MS = 400
const DEFAULT_ACCENT = '#e0b25a'

let container: HTMLDivElement | null = null
let visibleCount = 0
const queue: ToastOptions[] = []

/**
 * After the column moved or narrowed (resize, debug overlay shown), hide the
 * toasts that now reach below the HUD's top band (they keep their timers;
 * the first one always shows) and show them again once there is room.
 */
function fitShownToasts(): void {
  if (!container) return
  const limit = getHudTopBandBottom()
  let first = true
  for (const toast of Array.from(container.children) as HTMLElement[]) {
    const fits = first || toast.getBoundingClientRect().bottom <= limit
    toast.style.visibility = fits ? '' : 'hidden'
    first = false
  }
}

function getContainer(): HTMLDivElement {
  if (container) return container
  const el = document.createElement('div')
  el.style.display = 'flex'
  el.style.flexDirection = 'column'
  el.style.alignItems = 'stretch'
  el.style.gap = '8px'
  el.style.pointerEvents = 'none'
  mountHudElement(el, 'topRight', HudOrder.TOASTS)
  onHudLayout(fitShownToasts)
  container = el
  return el
}

function buildToast(options: ToastOptions): HTMLDivElement {
  const accent = options.accent ?? DEFAULT_ACCENT

  const toast = document.createElement('div')
  toast.style.display = 'flex'
  toast.style.alignItems = 'center'
  toast.style.gap = '10px'
  toast.style.padding = '8px 12px 8px 10px'
  toast.style.background = 'linear-gradient(90deg, rgba(28, 22, 16, 0.95), rgba(16, 13, 10, 0.92))'
  toast.style.border = '1px solid rgba(255, 255, 255, 0.12)'
  toast.style.borderLeft = `4px solid ${accent}`
  toast.style.borderRadius = '6px'
  toast.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.45)'
  toast.style.color = '#f2ead8'
  toast.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  toast.style.opacity = '0'
  toast.style.transform = 'translateX(24px)'
  toast.style.transition = `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`

  if (options.iconUrl) {
    const icon = document.createElement('img')
    icon.src = options.iconUrl
    icon.alt = ''
    icon.style.width = '36px'
    icon.style.height = '36px'
    icon.style.flex = '0 0 36px'
    icon.style.objectFit = 'contain'
    icon.style.imageRendering = 'pixelated'
    icon.addEventListener('error', () => icon.remove())
    toast.appendChild(icon)
  }

  const text = document.createElement('div')
  text.style.display = 'flex'
  text.style.flexDirection = 'column'
  text.style.minWidth = '0'

  if (options.caption) {
    const caption = document.createElement('div')
    caption.textContent = options.caption
    caption.style.fontSize = '10px'
    caption.style.letterSpacing = '0.08em'
    caption.style.textTransform = 'uppercase'
    caption.style.color = 'rgba(242, 234, 216, 0.6)'
    text.appendChild(caption)
  }

  const title = document.createElement('div')
  title.textContent = options.title
  title.style.fontSize = '14px'
  title.style.fontWeight = '700'
  title.style.color = accent
  title.style.lineHeight = '1.25'
  text.appendChild(title)

  if (options.body) {
    const body = document.createElement('div')
    body.textContent = options.body
    body.style.fontSize = '12px'
    body.style.lineHeight = '1.35'
    body.style.marginTop = '2px'
    body.style.color = 'rgba(242, 234, 216, 0.88)'
    text.appendChild(body)
  }

  toast.appendChild(text)
  return toast
}

/** Present `options` now; false when it does not fit below the toasts already shown. */
function present(options: ToastOptions): boolean {
  const root = getContainer()
  const toast = buildToast(options)
  root.appendChild(toast)
  if (visibleCount > 0 && toast.getBoundingClientRect().bottom > getHudTopBandBottom()) {
    toast.remove()
    return false
  }
  visibleCount++

  // Next frame: slide in
  requestAnimationFrame(() => {
    toast.style.opacity = '1'
    toast.style.transform = 'translateX(0)'
  })

  const duration = options.durationMs ?? DEFAULT_DURATION_MS
  window.setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateX(24px)'
    window.setTimeout(() => {
      toast.remove()
      visibleCount--
      fitShownToasts()
      const next = queue.shift()
      if (next && !present(next)) queue.unshift(next)
    }, FADE_MS)
  }, duration)
  return true
}

/** Show a toast (queued while {@link MAX_VISIBLE} are on screen or the column is full). */
export function showToast(options: ToastOptions): void {
  if (visibleCount >= MAX_VISIBLE || queue.length > 0 || !present(options)) {
    queue.push(options)
  }
}
