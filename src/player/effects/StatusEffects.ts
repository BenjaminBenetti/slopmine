import { gameEvents } from '../../events/GameEvents.ts'

/**
 * Timed status effects on the player (potions, boss debuffs, ...).
 *
 * This module only keeps the bookkeeping: which effects are active, at what
 * level, for how long. What an effect DOES lives with the system it changes
 * (fire resistance in the environmental damage path, slow falling in the
 * fall/gravity path, strength in the attack damage formula, ...), which asks
 * `playerEffects.has(id)` / `getLevel(id)` when it needs to. That keeps every
 * consumer decoupled from potions and bosses, and from each other.
 *
 * Effects are not persisted (a reload clears them) and death clears them.
 */

/** Well-known effect ids. Any string works; these are the shared ones. */
export const StatusEffectIds = {
  /** Immune to lava, burning and hot floors. */
  FIRE_RESISTANCE: 'fire_resistance',
  /** Fall gently; no fall damage. */
  SLOW_FALLING: 'slow_falling',
  /** Heal over time. */
  REGENERATION: 'regeneration',
  /** See in the dark (raises the light floor). */
  EMBER_SIGHT: 'ember_sight',
  /** More melee damage. */
  STRENGTH: 'strength',
  /** Take less damage from mobs and projectiles ("Iceskin"). */
  RESISTANCE: 'resistance',
  /** Damage over time (boss spores). */
  POISON: 'poison',
  /** Move slower (frost). */
  SLOWNESS: 'slowness',
  /** Move faster (whirlstone). */
  SWIFTNESS: 'swiftness',
} as const

export type StatusEffectId = (typeof StatusEffectIds)[keyof typeof StatusEffectIds] | (string & {})

export interface ActiveStatusEffect {
  readonly id: StatusEffectId
  /** 1 = level I, 2 = level II, ... */
  readonly level: number
  /** Seconds left. */
  readonly remaining: number
  /** Total seconds when (re)applied - for HUD progress. */
  readonly duration: number
}

/** Display info for the HUD and tooltips. */
export interface StatusEffectInfo {
  readonly name: string
  /** CSS colour for the HUD badge. */
  readonly color: string
  /** True for buffs, false for debuffs. */
  readonly beneficial: boolean
  /** Optional icon URL. */
  readonly iconUrl?: string
}

const effectInfo = new Map<string, StatusEffectInfo>([
  [StatusEffectIds.FIRE_RESISTANCE, { name: 'Fire Resistance', color: '#e8762a', beneficial: true }],
  [StatusEffectIds.SLOW_FALLING, { name: 'Slow Falling', color: '#d9d2bd', beneficial: true }],
  [StatusEffectIds.REGENERATION, { name: 'Regeneration', color: '#d9558f', beneficial: true }],
  [StatusEffectIds.EMBER_SIGHT, { name: 'Ember Sight', color: '#f2b13c', beneficial: true }],
  [StatusEffectIds.STRENGTH, { name: 'Strength', color: '#b8322a', beneficial: true }],
  [StatusEffectIds.RESISTANCE, { name: 'Iceskin', color: '#7fc4e8', beneficial: true }],
  [StatusEffectIds.POISON, { name: 'Poison', color: '#7a9a2e', beneficial: false }],
  [StatusEffectIds.SLOWNESS, { name: 'Frostbite', color: '#5a7fa8', beneficial: false }],
  [StatusEffectIds.SWIFTNESS, { name: 'Swiftness', color: '#6fd64a', beneficial: true }],
])

/** Register (or override) display info for an effect id. */
export function registerStatusEffectInfo(id: StatusEffectId, info: StatusEffectInfo): void {
  effectInfo.set(id, info)
}

export function getStatusEffectInfo(id: StatusEffectId): StatusEffectInfo {
  return effectInfo.get(id) ?? { name: id, color: '#aaaaaa', beneficial: true }
}

interface MutableEffect {
  id: StatusEffectId
  level: number
  remaining: number
  duration: number
}

export class StatusEffects {
  private readonly effects = new Map<string, MutableEffect>()
  private readonly listeners = new Set<() => void>()

  /**
   * Start or refresh an effect. A higher level replaces a lower one; at the
   * same level the longer remaining time wins. A lower level never shortens
   * or weakens a stronger active effect.
   */
  apply(id: StatusEffectId, durationSeconds: number, level = 1): void {
    if (!(durationSeconds > 0) || level < 1) return
    const current = this.effects.get(id)
    if (current) {
      if (level < current.level) return
      if (level === current.level && durationSeconds <= current.remaining) return
    }
    this.effects.set(id, { id, level, remaining: durationSeconds, duration: durationSeconds })
    gameEvents.emit({ type: 'effect-applied', effectId: id, durationSeconds })
    this.notify()
  }

  has(id: StatusEffectId): boolean {
    return this.effects.has(id)
  }

  /** Active level, or 0 when the effect is not active. */
  getLevel(id: StatusEffectId): number {
    return this.effects.get(id)?.level ?? 0
  }

  /** Seconds left, or 0 when the effect is not active. */
  getRemaining(id: StatusEffectId): number {
    return this.effects.get(id)?.remaining ?? 0
  }

  remove(id: StatusEffectId): void {
    if (this.effects.delete(id)) this.notify()
  }

  clear(): void {
    if (this.effects.size === 0) return
    this.effects.clear()
    this.notify()
  }

  /** Snapshot of the active effects (fresh array; safe to keep). */
  getActive(): ActiveStatusEffect[] {
    return Array.from(this.effects.values(), e => ({ ...e }))
  }

  /** Advance timers; call once per update tick. */
  update(deltaTime: number): void {
    if (this.effects.size === 0) return
    let expired = false
    for (const [id, effect] of this.effects) {
      effect.remaining -= deltaTime
      if (effect.remaining <= 0) {
        this.effects.delete(id)
        expired = true
      }
    }
    if (expired) this.notify()
  }

  /** Called when an effect starts, is refreshed, expires or is removed. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        console.error('[StatusEffects] listener threw:', error)
      }
    }
  }
}

/** The player's status effects. */
export const playerEffects = new StatusEffects()
