import { HudOrder, mountHudElement } from '../../ui/hudLayout.ts'
import { worldClock } from '../../daynight/WorldClock.ts'
import { getWeatherForecast, getWeatherSnapshot } from '../WeatherHooks.ts'
import { PARTICLE_KIND_INDEX, type ParticleKindId } from '../ParticleKinds.ts'
import type { WeatherLook } from '../WeatherLook.ts'

/** The plaque the Storm Glass shows while it is the selected item. */
export interface StormGlassHud {
  /** Call every frame with the selected item's id (null = empty slot). */
  update(heldItemId: string | null): void
}

/** Text refreshes this often while shown (ms). */
const REFRESH_MS = 500
/** How far ahead the glass reads (seconds): the nearer change wins. */
const FORECAST_NEAR = 120
const FORECAST_FAR = 300

const DIAL_SIZE = 34

interface Glyph {
  readonly char: string
  readonly color: string
}

// Text-presentation selector: keeps the symbols monochrome (no emoji)
const TEXT = '︎'

const has = (look: WeatherLook, ids: readonly ParticleKindId[], above = 0.05): boolean =>
  ids.some((id) => look.particles[PARTICLE_KIND_INDEX[id]] > above)

/** The dial's symbol for a weather's look (layer 0: the cavern's calm has no sun). */
function glyphFor(look: WeatherLook, layer: 0 | 1): Glyph {
  if (look.lightning > 0.5) return { char: '⚡' + TEXT, color: '#ffe27a' }
  if (has(look, ['snow', 'blacksnow', 'soulsnow'])) return { char: '❄' + TEXT, color: '#dff2ff' }
  if (has(look, ['rain', 'drizzle', 'sulphur', 'hail'])) return { char: '☂' + TEXT, color: '#9cc8ff' }
  if (has(look, ['sand', 'bone', 'ash'], 0.3)) return { char: '≋', color: '#e0b070' }
  if (has(look, ['ember', 'firefall'], 0.15)) return { char: '✷', color: '#ff9a4a' }
  if (look.meteors > 0.3) return { char: '☄' + TEXT, color: '#c8b8ff' }
  if (look.aurora > 0.3) return { char: '✦', color: '#8affc8' }
  if (look.groundFog > 0.03 || look.haze > 1 / 300) return { char: '≡', color: '#cfd6dc' }
  if (has(look, ['glitter', 'shard', 'wisp', 'spore', 'pollen', 'fluff', 'petal'])) return { char: '✧', color: '#e6f0ff' }
  if (look.cloud > 0.5) return { char: '☁' + TEXT, color: '#d8dde4' }
  if (layer === 0) return { char: '◇', color: '#c9a07a' }
  return worldClock.isNight ? { char: '☾' + TEXT, color: '#e6e2c8' } : { char: '☀' + TEXT, color: '#ffd36a' }
}

/**
 * The Storm Glass's plaque in the HUD's top-centre column (under the boss
 * bar and compasses), styled like the compass plaques: a brass dial with the
 * weather's symbol, the weather's name, and a forecast line - the first
 * change the glass sees in the next 2 or 5 minutes ("Rain Shower in ~2 min"),
 * else "Clear for now". Reads the weather through WeatherHooks; hidden unless
 * the Storm Glass is the selected item.
 */
export function createStormGlassHud(parent: HTMLElement = document.body): StormGlassHud {
  const root = document.createElement('div')
  Object.assign(root.style, {
    display: 'flex',
    maxWidth: '100%',
    boxSizing: 'border-box',
    alignItems: 'center',
    gap: '8px',
    padding: '3px 14px 3px 3px',
    borderRadius: `${DIAL_SIZE}px`,
    background: 'rgba(12, 18, 26, 0.62)',
    border: '1px solid rgba(170, 200, 220, 0.45)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.55)',
    pointerEvents: 'none',
    userSelect: 'none',
    opacity: '0',
    transition: 'opacity 0.3s ease-out',
    whiteSpace: 'nowrap',
    // Out of the slot's layout while hidden (a hidden plaque would push the next one down)
    visibility: 'hidden',
    position: 'absolute',
  } satisfies Partial<CSSStyleDeclaration>)

  const dial = document.createElement('div')
  Object.assign(dial.style, {
    position: 'relative',
    width: `${DIAL_SIZE}px`,
    height: `${DIAL_SIZE}px`,
    flex: '0 0 auto',
    borderRadius: '50%',
    boxSizing: 'border-box',
    border: '2px solid #b8923a',
    background: 'radial-gradient(circle at 50% 40%, #2c4a5a 0%, #15252e 70%, #0b1418 100%)',
    boxShadow: 'inset 0 0 0 1px #5a4a22',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '19px',
    lineHeight: '1',
    fontFamily: "'Segoe UI Symbol', 'DejaVu Sans', 'Noto Sans Symbols', sans-serif",
    textShadow: '0 0 6px rgba(255,255,255,0.35)',
  } satisfies Partial<CSSStyleDeclaration>)

  const text = document.createElement('div')
  Object.assign(text.style, {
    display: 'flex',
    flexDirection: 'column',
    minWidth: '0',
    lineHeight: '1.15',
    textShadow: '0 1px 2px rgba(0,0,0,0.9)',
  } satisfies Partial<CSSStyleDeclaration>)
  const title = document.createElement('div')
  Object.assign(title.style, {
    fontFamily: "'Times New Roman', 'Garamond', Georgia, serif",
    fontSize: '14px',
    fontWeight: 'bold',
    letterSpacing: '0.04em',
    color: '#e8eef2',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } satisfies Partial<CSSStyleDeclaration>)
  const detail = document.createElement('div')
  Object.assign(detail.style, {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: '11px',
    color: '#a9c2cf',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } satisfies Partial<CSSStyleDeclaration>)
  text.append(title, detail)
  root.append(dial, text)
  mountHudElement(root, 'topCenter', HudOrder.STORM_GLASS, parent)

  let visible = false
  let lastRefresh = -Infinity
  let lastKey = ''

  const setVisible = (show: boolean): void => {
    if (show === visible) return
    visible = show
    root.style.opacity = show ? '1' : '0'
    if (show) {
      root.style.visibility = 'visible'
      root.style.position = ''
      lastRefresh = -Infinity
    } else {
      // Leave the layout once faded out (unless shown again meanwhile)
      setTimeout(() => {
        if (visible) return
        root.style.visibility = 'hidden'
        root.style.position = 'absolute'
      }, 320)
    }
  }

  const refresh = (): void => {
    const now = getWeatherSnapshot()
    let glyph: Glyph
    let name: string
    let forecast: string
    if (!now) {
      glyph = { char: '…', color: '#8a9aa4' }
      name = 'The glass is still'
      forecast = ''
    } else {
      glyph = glyphFor(now.look as WeatherLook, now.layer)
      name = now.weatherName
      const near = getWeatherForecast(FORECAST_NEAR)
      const far = getWeatherForecast(FORECAST_FAR)
      if (near && near.weatherId !== now.weatherId) forecast = `${near.weatherName} in ~2 min`
      else if (far && far.weatherId !== now.weatherId) forecast = `${far.weatherName} in ~5 min`
      else forecast = `${now.weatherName} for now`
    }
    const key = `${glyph.char}|${name}|${forecast}`
    if (key === lastKey) return
    lastKey = key
    dial.textContent = glyph.char
    dial.style.color = glyph.color
    title.textContent = name
    detail.textContent = forecast
    detail.style.display = forecast ? '' : 'none'
  }

  return {
    update(heldItemId: string | null): void {
      setVisible(heldItemId === 'storm_glass')
      if (!visible) return
      const t = performance.now()
      if (t - lastRefresh < REFRESH_MS) return
      lastRefresh = t
      refresh()
    },
  }
}
