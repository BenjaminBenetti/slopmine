import { HudOrder, mountHudElement } from './hudLayout.ts'

/**
 * A short centered message above the hotbar and hearts ("action bar", in the
 * HUD's bottom-centre column right above the hearts and armor row): one line
 * at a time, fades out after a couple of seconds and then gives its space
 * back. Created lazily on first use.
 */
let noticeElement: HTMLDivElement | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
let collapseTimer: ReturnType<typeof setTimeout> | null = null

const FADE_MS = 300

function getNoticeElement(): HTMLDivElement {
  if (noticeElement) return noticeElement
  const el = document.createElement('div')
  el.style.padding = '3px 10px'
  el.style.borderRadius = '4px'
  el.style.background = 'rgba(0, 0, 0, 0.45)'
  el.style.color = 'rgba(255, 240, 225, 0.96)'
  el.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  el.style.fontSize = '13px'
  el.style.fontWeight = '600'
  el.style.textShadow = '1px 1px 1px rgba(0, 0, 0, 0.9)'
  el.style.whiteSpace = 'nowrap'
  el.style.pointerEvents = 'none'
  el.style.opacity = '0'
  el.style.display = 'none'
  el.style.transition = `opacity ${FADE_MS}ms ease-out`
  mountHudElement(el, 'bottomCenter', HudOrder.PLAYER_NOTICE)
  noticeElement = el
  return el
}

/** Show `text` for `durationMs` (replaces any message on screen). */
export function showPlayerNotice(text: string, durationMs = 2200): void {
  if (typeof document === 'undefined') return
  const el = getNoticeElement()
  el.textContent = text
  if (el.style.display === 'none') {
    el.style.display = ''
    void el.offsetWidth // start the fade-in from the collapsed state
  }
  el.style.opacity = '1'
  if (hideTimer) clearTimeout(hideTimer)
  if (collapseTimer) clearTimeout(collapseTimer)
  collapseTimer = null
  hideTimer = setTimeout(() => {
    el.style.opacity = '0'
    hideTimer = null
    collapseTimer = setTimeout(() => {
      el.style.display = 'none'
      collapseTimer = null
    }, FADE_MS)
  }, durationMs)
}
