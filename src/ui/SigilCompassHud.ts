import { HudOrder, mountHudElement } from './hudLayout.ts'

/** What the Sigil Compass HUD shows this frame. */
export type SigilCompassReading =
  | {
      readonly kind: 'target'
      /** Dungeon name. */
      readonly name: string
      /** Distance / height line. */
      readonly detail: string
      /** Direction to the dungeon relative to the view, radians, + = to the right. */
      readonly bearing: number
      /** The player is at the dungeon (needle circles). */
      readonly arrived: boolean
      /** Its guardian is already defeated. */
      readonly cleared: boolean
    }
  | { readonly kind: 'silent'; readonly message: string }

const DIAL_SIZE = 34

/** Colours of a compass plaque (the Sigil Compass's ember gold; the Delver's Compass's brass and rune teal). */
export interface CompassHudTheme {
  readonly plaque: string
  readonly plaqueBorder: string
  readonly dialBorder: string
  readonly dialFace: string
  readonly dialInset: string
  /** Glow around the dial while it points at something. */
  readonly glow: string
  readonly ring: string
  readonly needle: string
  readonly hub: string
  readonly detail: string
}

export const SIGIL_COMPASS_THEME: CompassHudTheme = {
  plaque: 'rgba(22, 13, 9, 0.62)',
  plaqueBorder: 'rgba(214, 170, 110, 0.45)',
  dialBorder: '#c99a2e',
  dialFace: 'radial-gradient(circle at 50% 45%, #3a2318 0%, #1c100b 70%, #120a07 100%)',
  dialInset: '#6b4518',
  glow: 'rgba(255, 122, 30, 0.45)',
  ring: 'rgba(255, 122, 30, 0.35)',
  needle: 'linear-gradient(to bottom, #ffe08a 0%, #ff7a1e 40%, #8a3a12 50%, #4a3a30 52%, #7a6a58 100%)',
  hub: '#f2c94c',
  detail: '#d9b98a',
}

/**
 * Sigil Compass HUD: a small plaque in the HUD's top-centre column (below the
 * boss bar; long names ellipsize to the column width) with a
 * gold dial whose ember needle turns toward the target, the dungeon's name
 * and its distance. When the sigil has nothing to point at, the needle drifts
 * idly and the plaque reads e.g. "The sigil is silent". Presentational only:
 * call `show(reading)` and `update(dt)` every frame while visible.
 */
export class SigilCompassHud {
  private readonly root: HTMLDivElement
  private readonly dial: HTMLDivElement
  private readonly needle: HTMLDivElement
  private readonly title: HTMLDivElement
  private readonly detail: HTMLDivElement
  private visible = false
  private reading: SigilCompassReading = { kind: 'silent', message: '' }
  private angle = 0
  private time = 0
  private lastKey = ''

  constructor(
    parent: HTMLElement = document.body,
    private readonly theme: CompassHudTheme = SIGIL_COMPASS_THEME,
    order: number = HudOrder.SIGIL_COMPASS
  ) {
    this.root = document.createElement('div')
    Object.assign(this.root.style, {
      display: 'flex',
      maxWidth: '100%',
      boxSizing: 'border-box',
      alignItems: 'center',
      gap: '8px',
      padding: '3px 14px 3px 3px',
      borderRadius: `${DIAL_SIZE}px`,
      background: theme.plaque,
      border: `1px solid ${theme.plaqueBorder}`,
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

    this.dial = document.createElement('div')
    Object.assign(this.dial.style, {
      position: 'relative',
      width: `${DIAL_SIZE}px`,
      height: `${DIAL_SIZE}px`,
      flex: '0 0 auto',
      borderRadius: '50%',
      boxSizing: 'border-box',
      border: `2px solid ${theme.dialBorder}`,
      background: theme.dialFace,
      boxShadow: `inset 0 0 0 1px ${theme.dialInset}`,
      transition: 'filter 0.3s, box-shadow 0.3s',
    } satisfies Partial<CSSStyleDeclaration>)

    // Faint rune ring on the face
    const ring = document.createElement('div')
    Object.assign(ring.style, {
      position: 'absolute',
      inset: '4px',
      borderRadius: '50%',
      border: `1px dashed ${theme.ring}`,
    } satisfies Partial<CSSStyleDeclaration>)

    this.needle = document.createElement('div')
    Object.assign(this.needle.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: '7px',
      height: `${DIAL_SIZE - 8}px`,
      marginLeft: '-3.5px',
      marginTop: `${-(DIAL_SIZE - 8) / 2}px`,
      clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
      background: theme.needle,
      transformOrigin: '50% 50%',
    } satisfies Partial<CSSStyleDeclaration>)

    const hub = document.createElement('div')
    Object.assign(hub.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: '6px',
      height: '6px',
      margin: '-3px 0 0 -3px',
      borderRadius: '50%',
      background: theme.hub,
      boxShadow: '0 0 2px #000',
    } satisfies Partial<CSSStyleDeclaration>)
    this.dial.append(ring, this.needle, hub)

    const text = document.createElement('div')
    Object.assign(text.style, {
      display: 'flex',
      flexDirection: 'column',
      minWidth: '0',
      lineHeight: '1.15',
      textShadow: '0 1px 2px rgba(0,0,0,0.9)',
    } satisfies Partial<CSSStyleDeclaration>)
    this.title = document.createElement('div')
    Object.assign(this.title.style, {
      fontFamily: "'Times New Roman', 'Garamond', Georgia, serif",
      fontSize: '14px',
      fontWeight: 'bold',
      letterSpacing: '0.04em',
      color: '#f1e3c8',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    } satisfies Partial<CSSStyleDeclaration>)
    this.detail = document.createElement('div')
    Object.assign(this.detail.style, {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '11px',
      color: theme.detail,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    } satisfies Partial<CSSStyleDeclaration>)
    text.append(this.title, this.detail)

    this.root.append(this.dial, text)
    mountHudElement(this.root, 'topCenter', order, parent)
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return
    this.visible = visible
    this.root.style.opacity = visible ? '1' : '0'
    if (visible) {
      this.root.style.visibility = 'visible'
      this.root.style.position = ''
    } else {
      // Leave the layout once faded out (unless shown again meanwhile)
      setTimeout(() => {
        if (this.visible) return
        this.root.style.visibility = 'hidden'
        this.root.style.position = 'absolute'
      }, 320)
    }
  }

  get isVisible(): boolean {
    return this.visible
  }

  /** The reading to display (cheap to call every frame; DOM text only changes when it does). */
  show(reading: SigilCompassReading): void {
    this.reading = reading
    const key =
      reading.kind === 'target'
        ? `t|${reading.name}|${reading.detail}|${reading.cleared}|${reading.arrived}`
        : `s|${reading.message}`
    if (key === this.lastKey) return
    this.lastKey = key
    if (reading.kind === 'target') {
      this.title.textContent = reading.cleared ? `${reading.name} (cleared)` : reading.name
      this.title.style.fontStyle = 'normal'
      this.title.style.color = reading.cleared ? '#bfb4a2' : '#f1e3c8'
      this.detail.textContent = reading.detail
      this.detail.style.display = ''
      this.dial.style.filter = reading.cleared ? 'grayscale(0.6)' : 'none'
      this.dial.style.boxShadow = `inset 0 0 0 1px ${this.theme.dialInset}, 0 0 8px ${this.theme.glow}`
    } else {
      this.title.textContent = reading.message
      this.title.style.fontStyle = 'italic'
      this.title.style.color = '#a8998a'
      this.detail.textContent = ''
      this.detail.style.display = 'none'
      this.dial.style.filter = 'grayscale(0.85) brightness(0.8)'
      this.dial.style.boxShadow = 'inset 0 0 0 1px #4a3a2a'
    }
  }

  /** Animate the needle (eases toward the bearing; idles when silent). */
  update(deltaTime: number): void {
    if (!this.visible) return
    this.time += deltaTime
    const reading = this.reading
    let goal: number
    let rate: number
    if (reading.kind === 'target' && !reading.arrived) {
      goal = reading.bearing
      rate = 10
    } else if (reading.kind === 'target') {
      // At the dungeon: the needle circles
      goal = this.angle + 4 * deltaTime
      rate = 30
    } else {
      // Silent: a slow, aimless drift
      goal = 0.9 * Math.sin(this.time * 0.7) + 0.4 * Math.sin(this.time * 1.9)
      rate = 2
    }
    const delta = Math.atan2(Math.sin(goal - this.angle), Math.cos(goal - this.angle))
    this.angle += delta * Math.min(1, rate * deltaTime)
    this.needle.style.transform = `rotate(${this.angle.toFixed(4)}rad)`
  }

  dispose(): void {
    this.root.remove()
  }
}
