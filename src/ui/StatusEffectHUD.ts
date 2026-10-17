import { HudOrder, mountHudElement } from './hudLayout.ts'
import { playerEffects, getStatusEffectInfo } from '../player/effects/StatusEffects.ts'
import type { StatusEffects, ActiveStatusEffect } from '../player/effects/StatusEffects.ts'

/**
 * Status effect badges in the HUD's top-left column, below the journal goal
 * line: icon, name (+ level), time left and a thin progress bar per active
 * effect. Buffs sit on a dark glass card with an
 * effect-coloured edge; debuffs on a red-tinted card with a red outline and
 * are listed first. A timer under 10 s blinks. Pointer-transparent.
 *
 * Structure is rebuilt on `effects.onChange` (start/refresh/expire); timers
 * are refreshed from `update(dt)` a few times per second.
 */
export interface StatusEffectHUD {
  readonly root: HTMLDivElement
  /** Advance the timer display (call every tick; self-throttled). */
  update(deltaTime: number): void
  setVisible(visible: boolean): void
  destroy(): void
}

const REFRESH_INTERVAL = 0.2
const ROMAN = ['', '', ' II', ' III', ' IV', ' V']

interface Badge {
  readonly id: string
  readonly root: HTMLDivElement
  readonly time: HTMLSpanElement
  readonly bar: HTMLDivElement
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r < 10 ? '0' : ''}${r}`
}

function createBadge(effect: ActiveStatusEffect): Badge {
  const info = getStatusEffectInfo(effect.id)
  const debuff = !info.beneficial

  const root = document.createElement('div')
  root.style.cssText = `
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    grid-template-rows: auto 3px;
    column-gap: 6px;
    row-gap: 3px;
    align-items: center;
    min-width: 150px;
    max-width: 100%;
    padding: 4px 7px 4px 5px;
    border-radius: 4px;
    box-sizing: border-box;
  `
  if (debuff) {
    root.style.background = 'linear-gradient(90deg, rgba(92, 14, 14, 0.82), rgba(52, 8, 8, 0.7))'
    root.style.border = '1px solid rgba(235, 80, 70, 0.85)'
    root.style.boxShadow = '0 0 6px rgba(200, 40, 30, 0.45)'
  } else {
    root.style.background = 'rgba(14, 14, 20, 0.62)'
    root.style.border = '1px solid rgba(255, 255, 255, 0.12)'
    root.style.borderLeft = `3px solid ${info.color}`
  }

  const icon = document.createElement('div')
  icon.style.cssText = 'width: 22px; height: 22px; grid-row: 1 / span 2; display: flex; align-items: center; justify-content: center;'
  if (info.iconUrl) {
    const img = document.createElement('img')
    img.src = info.iconUrl
    img.alt = ''
    img.draggable = false
    img.style.cssText = 'width: 22px; height: 22px; image-rendering: pixelated; filter: drop-shadow(0 0 2px rgba(0,0,0,0.7));'
    icon.appendChild(img)
  } else {
    const dot = document.createElement('div')
    dot.style.cssText = `width: 12px; height: 12px; border-radius: 50%; background: ${info.color}; box-shadow: 0 0 4px ${info.color};`
    icon.appendChild(dot)
  }

  const name = document.createElement('span')
  name.textContent = `${info.name}${ROMAN[effect.level] ?? ` ${effect.level}`}`
  name.style.cssText = `
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    color: ${debuff ? '#ffb3a8' : '#f2efe6'};
  `

  const time = document.createElement('span')
  time.style.cssText = `
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: ${debuff ? '#ffd6cf' : '#d8d4c8'};
    padding-left: 6px;
  `

  const track = document.createElement('div')
  track.style.cssText = 'grid-column: 2 / span 2; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.12); overflow: hidden;'
  const bar = document.createElement('div')
  bar.style.cssText = `height: 100%; width: 100%; background: ${debuff ? '#e8584a' : info.color}; transform-origin: left center;`
  track.appendChild(bar)

  root.append(icon, name, time, track)
  return { id: effect.id, root, time, bar }
}

export function createStatusEffectHUD(
  effects: StatusEffects = playerEffects,
  parent: HTMLElement = document.body
): StatusEffectHUD {
  const root = document.createElement('div')
  root.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 100%;
    pointer-events: none;
    user-select: none;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  `
  mountHudElement(root, 'topLeft', HudOrder.STATUS_EFFECTS, parent)

  let badges: Badge[] = []
  let refreshTimer = 0
  let blinkPhase = 0

  const refreshTimes = (): void => {
    if (badges.length === 0) return
    const active = effects.getActive()
    for (const badge of badges) {
      const effect = active.find(e => e.id === badge.id)
      if (!effect) continue
      badge.time.textContent = formatTime(effect.remaining)
      const fraction = effect.duration > 0 ? Math.max(0, Math.min(1, effect.remaining / effect.duration)) : 0
      badge.bar.style.transform = `scaleX(${fraction.toFixed(4)})`
      // Running out: blink the timer
      badge.time.style.opacity = effect.remaining < 10 && blinkPhase < 0.5 ? '0.35' : '1'
    }
  }

  const rebuild = (): void => {
    const active = effects.getActive()
    // Debuffs first (they are what the player must react to), then buffs;
    // apply order within each group
    active.sort((a, b) => {
      const da = getStatusEffectInfo(a.id).beneficial ? 1 : 0
      const db = getStatusEffectInfo(b.id).beneficial ? 1 : 0
      return da - db
    })
    root.replaceChildren()
    badges = active.map(effect => {
      const badge = createBadge(effect)
      root.appendChild(badge.root)
      return badge
    })
    refreshTimes()
  }

  const unsubscribe = effects.onChange(rebuild)
  rebuild()

  return {
    root,
    update(deltaTime: number): void {
      blinkPhase = (blinkPhase + deltaTime) % 1
      refreshTimer -= deltaTime
      if (refreshTimer > 0) return
      refreshTimer = REFRESH_INTERVAL
      refreshTimes()
    },
    setVisible(visible: boolean): void {
      root.style.display = visible ? 'flex' : 'none'
    },
    destroy(): void {
      unsubscribe()
      root.remove()
    },
  }
}
