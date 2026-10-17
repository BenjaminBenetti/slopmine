import * as THREE from 'three'
import { playerEffects, StatusEffectIds } from './StatusEffects.ts'
import type { StatusEffects } from './StatusEffects.ts'
import { registerDamageModifier, applyDamageModifiers } from '../DamageModifiers.ts'
import type { DamageSource } from '../DamageModifiers.ts'
import type { IPlayerHealth } from '../PlayerHealth.ts'
import { GRAVITY } from '../../physics/constants.ts'

/**
 * What the player's status effects DO (alchemy owns every behaviour except
 * strength, which lives in the attack damage formula, and armor).
 *
 * - Damage-shaped effects are damage modifiers (fire resistance, slow falling,
 *   Iceskin), so every damage path picks them up without knowing about them.
 * - Per-tick effects run in `update(dt)` (one CRITICAL task, registered after
 *   the 'skybox' task so the ember sight light floor post-adjusts the biome's):
 *   slow falling's glide, regeneration, poison and ember sight.
 * - Slowness is a movement speed multiplier (`getMovementSpeedMultiplier`),
 *   registered with the camera controls.
 */

/** Tuning, exported for the HUD/tooltips and tests. */
export const EFFECT_TUNING = {
  /** Slow falling: steady descent speed (blocks/s) the glide settles at. */
  slowFallSpeed: 4.0,
  /** Slow falling: a faster fall is braked toward it exponentially (1/s)... */
  slowFallBrake: 6,
  /** ...plus a constant deceleration (blocks/s², > |gravity| so it settles exactly). */
  slowFallDecel: 40,
  /** Regeneration: seconds per healed HP at level I (level n heals n× as fast). */
  regenerationInterval: 2.5,
  /** Poison: seconds per HP of magic damage at level I (never below 1 HP). */
  poisonInterval: 1.25,
  /** Iceskin (resistance): melee/projectile damage reduction per level. */
  resistancePerLevel: 0.2,
  /** Frostbite (slowness): movement speed reduction per level. */
  slownessPerLevel: 0.25,
  /** Frostbite floor: never slower than this fraction of normal speed. */
  minSpeedMultiplier: 0.25,
  /**
   * Ember sight: the light floor (linear RGB, where no sky/block light
   * reaches) is raised to at least this warm level, and the biome's own floor
   * is boosted by `emberSightGain` so its colour still shows through. Near 1
   * a dark surface shows its own texture colour, flat and unshaded - readable,
   * clearly not daylight (no sun, no directional shading). Measured in the
   * Molten Wastes: half this lift was barely noticeable next to the lava glow.
   */
  emberSightFloor: { r: 0.92, g: 0.76, b: 0.58 },
  emberSightGain: 1.6,
  /** Ember sight fade in / fade out (strength units per second). */
  emberSightFadeIn: 2.0,
  emberSightFadeOut: 0.8,
} as const

/** Minimal physics body surface (PhysicsBody satisfies it). */
export interface IEffectBody {
  readonly velocity: THREE.Vector3
  readonly skipPhysics: boolean
  readonly isClimbing: boolean
}

export interface EffectBehaviourDeps {
  readonly effects?: StatusEffects
  readonly playerHealth: IPlayerHealth
  readonly playerBody: IEffectBody
  /** Current light floor (after the atmosphere set it this tick). */
  readonly getLightFloor: () => THREE.Color
  readonly setLightFloor: (color: THREE.Color) => void
  /** Called when an effect hurt the player (health bar flash, vignette pulse). */
  readonly onEffectDamage?: (effectId: string) => void
}

/** Damage multiplier of the active Iceskin (resistance) level. */
export function getResistanceMultiplier(effects: StatusEffects = playerEffects): number {
  const level = effects.getLevel(StatusEffectIds.RESISTANCE)
  return level > 0 ? Math.max(0, 1 - EFFECT_TUNING.resistancePerLevel * level) : 1
}

/** Movement speed multiplier of the active Frostbite (slowness) level. */
export function getMovementSpeedMultiplier(effects: StatusEffects = playerEffects): number {
  const level = effects.getLevel(StatusEffectIds.SLOWNESS)
  if (level <= 0) return 1
  return Math.max(EFFECT_TUNING.minSpeedMultiplier, 1 - EFFECT_TUNING.slownessPerLevel * level)
}

/**
 * The damage modifier for status effects:
 * fire resistance → fire 0; slow falling → fall 0; Iceskin → melee and
 * projectile × (1 − 0.2·level).
 */
export function statusEffectDamageModifier(
  amount: number,
  source: DamageSource,
  effects: StatusEffects = playerEffects
): number {
  switch (source) {
    case 'fire':
      return effects.has(StatusEffectIds.FIRE_RESISTANCE) ? 0 : amount
    case 'fall':
      return effects.has(StatusEffectIds.SLOW_FALLING) ? 0 : amount
    case 'melee':
    case 'projectile':
      return amount * getResistanceMultiplier(effects)
    default:
      return amount
  }
}

export class EffectBehaviours {
  private readonly effects: StatusEffects
  private readonly deps: EffectBehaviourDeps
  private readonly unregisterModifier: () => void

  private regenTimer = 0
  private regenLevel = 0
  private poisonTimer = 0
  private poisonLevel = 0
  /** Ember sight blend 0-1 (eased so the world never pops brighter/darker). */
  private emberStrength = 0
  private readonly floorScratch = new THREE.Color()
  private readonly baseScratch = new THREE.Color()

  constructor(deps: EffectBehaviourDeps) {
    this.deps = deps
    this.effects = deps.effects ?? playerEffects
    const effects = this.effects
    this.unregisterModifier = registerDamageModifier((amount, source) =>
      statusEffectDamageModifier(amount, source, effects)
    )
  }

  /** True while fire resistance makes the player immune to fire (vignette, burning). */
  isFireImmune(): boolean {
    return this.effects.has(StatusEffectIds.FIRE_RESISTANCE)
  }

  /** Current ember sight blend (0 = off, 1 = full). */
  getEmberSightStrength(): number {
    return this.emberStrength
  }

  update(dt: number): void {
    this.updateSlowFalling(dt)
    this.updateRegeneration(dt)
    this.updatePoison(dt)
    this.updateEmberSight(dt)
  }

  dispose(): void {
    this.unregisterModifier()
  }

  /**
   * Brake the fall toward a gentle glide. Runs after physics: the velocity set
   * here is what the next physics step starts from, so pre-compensate the
   * gravity it will add (the body then moves at exactly the glide speed).
   * Upward motion (jumps, knockback) is untouched; flying and climbing too.
   */
  private updateSlowFalling(dt: number): void {
    if (!this.effects.has(StatusEffectIds.SLOW_FALLING)) return
    const body = this.deps.playerBody
    if (body.skipPhysics || body.isClimbing) return
    const target = -EFFECT_TUNING.slowFallSpeed - GRAVITY * dt // GRAVITY < 0: slightly above -speed
    const excess = target - body.velocity.y
    if (excess <= 0) return
    // A plunge brakes smoothly (parachute); the glide holds exactly
    const braked = excess * Math.exp(-EFFECT_TUNING.slowFallBrake * dt) - EFFECT_TUNING.slowFallDecel * dt
    body.velocity.y = target - Math.max(0, braked)
  }

  private updateRegeneration(dt: number): void {
    const level = this.effects.getLevel(StatusEffectIds.REGENERATION)
    const health = this.deps.playerHealth
    if (level !== this.regenLevel) {
      // A new or changed effect starts a fresh interval
      this.regenLevel = level
      this.regenTimer = 0
    }
    if (level <= 0 || health.isDead) {
      this.regenTimer = 0
      return
    }
    if (health.currentHealth >= health.maxHealth) {
      // Full: don't bank ticks for later
      this.regenTimer = 0
      return
    }
    const interval = EFFECT_TUNING.regenerationInterval / level
    this.regenTimer += dt
    while (this.regenTimer >= interval) {
      this.regenTimer -= interval
      health.heal(1)
    }
  }

  private updatePoison(dt: number): void {
    const level = this.effects.getLevel(StatusEffectIds.POISON)
    const health = this.deps.playerHealth
    if (level !== this.poisonLevel) {
      this.poisonLevel = level
      this.poisonTimer = 0
    }
    if (level <= 0 || health.isDead) {
      this.poisonTimer = 0
      return
    }
    const interval = EFFECT_TUNING.poisonInterval / level
    this.poisonTimer += dt
    while (this.poisonTimer >= interval) {
      this.poisonTimer -= interval
      // Poison never kills: it stops at 1 HP
      const amount = Math.min(applyDamageModifiers(1, 'magic'), health.currentHealth - 1)
      if (amount > 0) {
        health.takeEnvironmentalDamage(amount)
        this.deps.onEffectDamage?.(StatusEffectIds.POISON)
      }
    }
  }

  /**
   * Post-adjust the light floor the atmosphere set this tick: at least a warm,
   * readable level, the biome's own floor boosted on top so its colour stays.
   */
  private updateEmberSight(dt: number): void {
    const active = this.effects.has(StatusEffectIds.EMBER_SIGHT)
    if (active) {
      this.emberStrength = Math.min(1, this.emberStrength + EFFECT_TUNING.emberSightFadeIn * dt)
    } else if (this.emberStrength > 0) {
      this.emberStrength = Math.max(0, this.emberStrength - EFFECT_TUNING.emberSightFadeOut * dt)
    }
    if (this.emberStrength <= 0) return

    const base = this.baseScratch.copy(this.deps.getLightFloor())
    const floor = EFFECT_TUNING.emberSightFloor
    const gain = EFFECT_TUNING.emberSightGain
    this.floorScratch.setRGB(
      Math.max(base.r * gain, floor.r),
      Math.max(base.g * gain, floor.g),
      Math.max(base.b * gain, floor.b)
    )
    // Smoothstep the blend so the fade has no visible kink
    const s = this.emberStrength
    base.lerp(this.floorScratch, s * s * (3 - 2 * s))
    this.deps.setLightFloor(base)
  }
}
