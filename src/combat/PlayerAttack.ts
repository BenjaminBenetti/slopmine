import type { IItem } from '../items/Item.ts'
import { playerEffects, StatusEffectIds } from '../player/effects/StatusEffects.ts'
import { FIST_PROFILE, getWeaponProfile } from './WeaponProfiles.ts'

/** Damage of a bare-handed hit (fully charged). */
export const FIST_DAMAGE = FIST_PROFILE.attackDamage

/** Extra melee damage per strength level (+30 % each). */
export const STRENGTH_DAMAGE_PER_LEVEL = 0.3

/**
 * Damage share of an uncharged hit. Damage scales with charge as
 * `MIN + (1 - MIN) * charge^2` (Minecraft 1.9 style): a hit at 30 % charge
 * does under a fifth of a full one, and spam-clicking never out-damages timed
 * hits (even at 15 clicks/s it stays below full-charge DPS).
 */
const UNCHARGED_DAMAGE_SHARE = 0.1
/** Knockback (and hit-stun) share of an uncharged hit, same curve. */
const UNCHARGED_IMPACT_SHARE = 0.2

/**
 * Attack cooldown bookkeeping: one timer for the player's arm, the game time
 * since the last hit. Charge is that time over the HELD item's cooldown, so
 * swapping items never skips a recovery. Advanced by tickPlayerAttack (the
 * 'player-combat' task).
 */
let timeSinceAttack = Number.POSITIVE_INFINITY
const attackListeners = new Set<(heldItem: IItem | null) => void>()

/**
 * Advance the attack cooldown. Call once per frame with game time.
 */
export function tickPlayerAttack(deltaTime: number): void {
  timeSinceAttack += deltaTime
}

/**
 * Attack charge for `heldItem`, 0 (just swung) to 1 (fully recovered).
 */
export function getPlayerAttackCharge(heldItem: IItem | null | undefined): number {
  const cooldown = getWeaponProfile(heldItem).attackCooldown
  return cooldown > 0 ? Math.min(1, timeSinceAttack / cooldown) : 1
}

/** True once the held item's attack is fully charged. */
export function isPlayerAttackReady(heldItem: IItem | null | undefined): boolean {
  return getPlayerAttackCharge(heldItem) >= 1
}

/**
 * Damage the player's melee hit deals with `heldItem` (null = fist), right
 * now: the item's weapon profile × attack charge × strength.
 *
 * THE single source of truth for player melee damage: every entity's
 * onPlayerInteract takes its damage from here, never from the held item's
 * mining stats directly. The hit itself is recorded by the caller
 * (registerPlayerAttack, in BlockInteraction) AFTER the entity applied it.
 */
export function getPlayerAttackDamage(heldItem: IItem | null | undefined): number {
  const charge = getPlayerAttackCharge(heldItem)
  const chargeShare = UNCHARGED_DAMAGE_SHARE + (1 - UNCHARGED_DAMAGE_SHARE) * charge * charge
  const strength = Math.max(0, playerEffects.getLevel(StatusEffectIds.STRENGTH))
  const strengthBonus = 1 + STRENGTH_DAMAGE_PER_LEVEL * strength
  return getWeaponProfile(heldItem).attackDamage * chargeShare * strengthBonus
}

/**
 * Multiplier for the knockback an entity applies when the player hits it with
 * `heldItem` (its push velocity and its hit-stun time): the weapon's knockback
 * × charge. Entities multiply their own configured knockback by it, so a weak
 * flurry neither shoves mobs around nor stun-locks them.
 */
export function getPlayerAttackKnockback(heldItem: IItem | null | undefined): number {
  const charge = getPlayerAttackCharge(heldItem)
  const chargeShare = UNCHARGED_IMPACT_SHARE + (1 - UNCHARGED_IMPACT_SHARE) * charge * charge
  return getWeaponProfile(heldItem).knockback * chargeShare
}

/**
 * Record that the player just hit something: restarts the attack cooldown and
 * notifies listeners (swing animation, ...). Call after the hit was applied.
 */
export function registerPlayerAttack(heldItem: IItem | null): void {
  timeSinceAttack = 0
  for (const listener of attackListeners) {
    try {
      listener(heldItem)
    } catch (error) {
      console.error('[PlayerAttack] attack listener threw:', error)
    }
  }
}

/**
 * Subscribe to player hits. Returns an unsubscribe function.
 */
export function onPlayerAttack(listener: (heldItem: IItem | null) => void): () => void {
  attackListeners.add(listener)
  return () => {
    attackListeners.delete(listener)
  }
}

/** Forget the cooldown (e.g. on respawn): the next hit is fully charged. */
export function resetPlayerAttack(): void {
  timeSinceAttack = Number.POSITIVE_INFINITY
}
