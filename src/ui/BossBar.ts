import { HudOrder, mountHudElement } from './hudLayout.ts'

/**
 * What the boss bar shows. GuardianEntity implements it; anything else with
 * a name and a health fraction can too.
 */
export interface BossBarTarget {
  readonly displayName: string
  /** Current health / max health, 0-1. */
  readonly healthFraction: number
  /** Health fractions where phases change (drawn as notches), descending. */
  readonly phaseThresholds: readonly number[]
  /** True while hits do no damage (bar dims and shimmers). */
  readonly isInvulnerable: boolean
  /** CSS colour of the health fill. */
  readonly bossBarColor: string
}

const BAR_HEIGHT = 12

/**
 * Top-centre boss health bar (first in the HUD's top-centre column: 440 px,
 * narrower on small windows): the guardian's name over a health bar with
 * phase notches and a trailing "recent damage" chip that eases down after a
 * hit. Fades in while a target is set and out when it is cleared. Purely
 * presentational - call `setTarget()` when the engaged boss changes and
 * `update(dt)` every frame.
 */
export class BossBar {
  private readonly root: HTMLDivElement
  private readonly nameLabel: HTMLDivElement
  private readonly fill: HTMLDivElement
  private readonly chip: HTMLDivElement
  private readonly notches: HTMLDivElement
  private target: BossBarTarget | null = null
  private shownFraction = 1
  private chipFraction = 1
  private chipHold = 0
  private notchKey = ''
  private visible = false
  private time = 0

  constructor(parent: HTMLElement = document.body) {
    this.root = document.createElement('div')
    Object.assign(this.root.style, {
      // Fills the top-centre column; keeps its space while faded out, so the
      // compass below never jumps when a fight starts
      width: '100%',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.45s ease-out',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
    } satisfies Partial<CSSStyleDeclaration>)

    this.nameLabel = document.createElement('div')
    Object.assign(this.nameLabel.style, {
      fontFamily: "'Times New Roman', 'Garamond', Georgia, serif",
      fontSize: '17px',
      fontWeight: 'bold',
      letterSpacing: '0.12em',
      color: '#f1e3c8',
      textShadow: '0 0 6px rgba(0,0,0,0.9), 1px 1px 0 #000',
      whiteSpace: 'nowrap',
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    } satisfies Partial<CSSStyleDeclaration>)

    const frame = document.createElement('div')
    Object.assign(frame.style, {
      position: 'relative',
      width: '100%',
      height: `${BAR_HEIGHT}px`,
      background: 'linear-gradient(#1a0d0d, #2a1414)',
      border: '2px solid #0c0606',
      outline: '1px solid rgba(214, 170, 110, 0.55)',
      boxShadow: '0 2px 6px rgba(0,0,0,0.7)',
      overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>)

    this.chip = document.createElement('div')
    Object.assign(this.chip.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      bottom: '0',
      width: '100%',
      background: '#f3d9a4',
    } satisfies Partial<CSSStyleDeclaration>)

    this.fill = document.createElement('div')
    Object.assign(this.fill.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      bottom: '0',
      width: '100%',
      transition: 'filter 0.2s',
    } satisfies Partial<CSSStyleDeclaration>)

    this.notches = document.createElement('div')
    Object.assign(this.notches.style, { position: 'absolute', inset: '0' } satisfies Partial<CSSStyleDeclaration>)

    frame.append(this.chip, this.fill, this.notches)
    this.root.append(this.nameLabel, frame)
    mountHudElement(this.root, 'topCenter', HudOrder.BOSS_BAR, parent)
  }

  /** Show `target` (null hides the bar). */
  setTarget(target: BossBarTarget | null): void {
    if (target === this.target) return
    this.target = target
    if (target) {
      this.nameLabel.textContent = target.displayName
      this.shownFraction = this.chipFraction = clamp01(target.healthFraction)
      this.chipHold = 0
      this.fill.style.background = `linear-gradient(${lighten(target.bossBarColor)}, ${target.bossBarColor} 55%, ${darken(target.bossBarColor)})`
      this.notchKey = ''
    }
    this.setVisible(target !== null)
  }

  /** The bar's current target (null when hidden). */
  getTarget(): BossBarTarget | null {
    return this.target
  }

  update(deltaTime: number): void {
    const target = this.target
    if (!target) return
    this.time += deltaTime

    const fraction = clamp01(target.healthFraction)
    if (fraction < this.shownFraction) {
      // Fresh damage: hold the chip a moment, then let it drain
      this.chipFraction = Math.max(this.chipFraction, this.shownFraction)
      this.chipHold = 0.5
    }
    this.shownFraction = fraction
    if (this.chipHold > 0) {
      this.chipHold -= deltaTime
    } else if (this.chipFraction > fraction) {
      this.chipFraction = Math.max(fraction, this.chipFraction - deltaTime * 0.5)
    }
    if (this.chipFraction < fraction) this.chipFraction = fraction

    this.fill.style.width = `${(fraction * 100).toFixed(2)}%`
    this.chip.style.width = `${(this.chipFraction * 100).toFixed(2)}%`
    this.fill.style.filter = target.isInvulnerable
      ? `grayscale(0.7) brightness(${(1.05 + 0.25 * Math.sin(this.time * 9)).toFixed(3)})`
      : 'none'

    const key = target.phaseThresholds.join(',')
    if (key !== this.notchKey) {
      this.notchKey = key
      this.notches.replaceChildren(
        ...target.phaseThresholds.map((threshold) => {
          const notch = document.createElement('div')
          Object.assign(notch.style, {
            position: 'absolute',
            top: '0',
            bottom: '0',
            left: `${(clamp01(threshold) * 100).toFixed(2)}%`,
            width: '2px',
            marginLeft: '-1px',
            background: 'rgba(12, 6, 6, 0.85)',
          } satisfies Partial<CSSStyleDeclaration>)
          return notch
        })
      )
    }
  }

  private setVisible(visible: boolean): void {
    if (visible === this.visible) return
    this.visible = visible
    this.root.style.opacity = visible ? '1' : '0'
  }

  dispose(): void {
    this.root.remove()
    this.target = null
  }
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : Number.isFinite(value) ? value : 0
}

/** Mix a #rrggbb colour toward white/black (other CSS colours pass through). */
function mix(color: string, toward: number, amount: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color)
  if (!match) return color
  const value = parseInt(match[1], 16)
  const channel = (shift: number): number => {
    const c = (value >> shift) & 0xff
    return Math.round(c + (toward - c) * amount)
  }
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

function lighten(color: string): string {
  return mix(color, 255, 0.35)
}

function darken(color: string): string {
  return mix(color, 0, 0.45)
}
