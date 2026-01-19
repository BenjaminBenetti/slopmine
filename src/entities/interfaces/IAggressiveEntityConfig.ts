import type { IPeacefulEntityConfig } from '../PeacefulEntity.ts'

/**
 * Aggression mode determines when an entity becomes hostile.
 */
export enum AggressionMode {
  /** Always hostile toward players (zombies, spiders) */
  ALWAYS_AGGRESSIVE = 'always',
  /** Only becomes hostile when provoked/hit (alligators, wolves) */
  AGGRESSIVE_WHEN_PROVOKED = 'provoked',
}

/**
 * Configuration for aggressive entities.
 * Extends peaceful entity config with combat and targeting options.
 */
export interface IAggressiveEntityConfig extends IPeacefulEntityConfig {
  // Detection
  /** How the entity becomes aggressive. Default: ALWAYS_AGGRESSIVE */
  aggressionMode?: AggressionMode
  /** Distance at which the entity detects and targets the player. Default: 16 blocks */
  detectionRange?: number

  // Chase
  /** Movement speed when chasing the player. Default: 5.0 blocks/sec */
  chaseSpeed?: number

  // Attack
  /** Distance at which the entity can attack the player. Default: 2.0 blocks */
  attackRange?: number
  /** Minimum time between attacks. Default: 1.5 seconds */
  attackCooldown?: number
  /** Damage dealt per attack. Default: 4 (2 hearts) */
  attackDamage?: number
  /** Horizontal knockback force applied to player on attack. Default: 4.0 */
  attackKnockbackHorizontal?: number
  /** Vertical knockback force applied to player on attack. Default: 3.0 */
  attackKnockbackVertical?: number

  // Aggro management
  /** Time after losing sight of player before losing aggro. Default: 5.0 seconds */
  aggroTimeout?: number
  /** Duration of aggression after being provoked (for AGGRESSIVE_WHEN_PROVOKED). Default: 10.0 seconds */
  provokedDuration?: number
}
