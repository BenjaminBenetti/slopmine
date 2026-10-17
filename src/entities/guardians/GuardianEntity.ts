/**
 * GuardianEntity - abstract base for dungeon bosses ("guardians").
 *
 * A subclass supplies stats (constructor config), a model (`createMesh`),
 * animations (`updateAnimations`) and its attacks (`defineAttacks`). The base
 * does the rest: arena leash + reset, engagement and the boss bar, the attack
 * scheduler (cooldowns, ranges, phases, telegraph windup -> execute ->
 * recovery), health phases, knockback/stun-lock resistance, invulnerability
 * windows, hurt flash, projectiles, minions, player debuffs, the
 * `guardian-defeated` event (exactly once), loot and the death animation.
 *
 * Summoned by the guardian spawner block (see src/dungeons/): register a
 * factory with `registerGuardian({ id, index, displayName, create })`.
 *
 * Minimal subclass:
 *
 * ```ts
 * export class PyreTyrantEntity extends GuardianEntity {
 *   private arm: THREE.Group | null = null
 *
 *   constructor(position: THREE.Vector3) {
 *     super({
 *       position,
 *       guardianId: 'pyre_tyrant',
 *       displayName: 'The Pyre Tyrant',
 *       maxHealth: 450,
 *       hitboxSize: new THREE.Vector3(1.6, 3.2, 1.6),
 *       chaseSpeed: 3.5,
 *       attackRange: 3,             // melee reach, centre to centre
 *       attackDamage: 12,           // meleeStrike() default damage
 *       phaseThresholds: [0.6, 0.3],
 *       arenaRadius: 20,
 *       bossBarColor: '#d2461e',
 *       drops: [guardianDrop('ember_sigil'), guardianDrop('infernal_heart'), guardianDrop('infernium_ingot', 2, 4)],
 *     })
 *   }
 *
 *   protected createMesh(): THREE.Object3D {
 *     const group = new THREE.Group()
 *     const body = new THREE.MeshLambertMaterial({ color: 0x3a1a12 })
 *     this.registerMaterialForLighting(body)   // lit like terrain; also gets the hurt flash
 *     // ... boxes; the model faces +Z ...
 *     return group
 *   }
 *
 *   protected updateAnimations(dt: number): void {
 *     // this.isWalking, this.activeAttackId, this.attackStage ('windup' | 'active' | 'recovery'),
 *     // this.attackStageProgress (0-1), this.phase, this.isTransitioning, this.isEngaged
 *     if (this.arm) this.arm.rotation.x = this.attackStage === 'windup' ? -2 * this.attackStageProgress : 0
 *   }
 *
 *   protected defineAttacks(): GuardianAttack[] {
 *     return [
 *       { id: 'slam', cooldown: 4, windup: 0.9, maxRange: 3.5,
 *         execute: () => { this.areaStrike(this.position, 4, 12, { knockback: 8 }) } },
 *       { id: 'fireball', cooldown: 3, windup: 0.6, minRange: 4, maxRange: 26, requiresLineOfSight: true,
 *         execute: () => { this.spawnProjectile({ preset: 'fireball', speed: 16, damage: 9 }) } },
 *       { id: 'volley', cooldown: 9, windup: 1.2, phases: [1, 2], maxRange: 30,
 *         execute: () => { this.spawnProjectileFan(5, Math.PI / 3, { preset: 'fireball', speed: 13, damage: 7 }) } },
 *       { id: 'imps', cooldown: 20, windup: 1.5, phases: [2], maxRange: 40, canUse: () => this.minionCount < 3,
 *         execute: () => { this.spawnMinion(new ImpEntity({ position: this.position.clone() })) } },
 *     ]
 *   }
 *
 *   protected onPhaseChanged(phase: number): void {
 *     if (phase === 2) this.applyEffectToPlayer(StatusEffectIds.SLOWNESS, 4, 1)
 *   }
 * }
 * ```
 *
 * Conventions: the model faces +Z (the base turns `mesh.rotation.y`);
 * ranges are horizontal distances between centres; keep the hitbox at most
 * ~4 blocks wide so melee reach (5 blocks from the eye to the guardian's
 * feet position) still finds it.
 */
import * as THREE from 'three'
import { AggressiveEntity } from '../AggressiveEntity.ts'
import { AggressionMode, type IAggressiveEntityConfig } from '../interfaces/IAggressiveEntityConfig.ts'
import type { EntityId, IEntity } from '../interfaces/IEntity.ts'
import { EntityState } from '../interfaces/IEntity.ts'
import type { IEntityDrop } from '../PeacefulEntity.ts'
import type { IItem } from '../../items/Item.ts'
import { getPlayerAttackDamage } from '../../combat/PlayerAttack.ts'
import type { DamageSource } from '../../player/DamageModifiers.ts'
import { playerEffects, type StatusEffectId } from '../../player/effects/StatusEffects.ts'
import { gameEvents } from '../../events/GameEvents.ts'
import { createItemFromId } from '../../persistence/ItemRegistry.ts'
import { ProjectileEntity, type ProjectileOptions } from '../projectiles/ProjectileEntity.ts'
import { getDungeonServices } from '../../dungeons/DungeonServices.ts'
import type { BossBarTarget } from '../../ui/BossBar.ts'

/** How a guardian moves. */
export type GuardianMovement = 'ground' | 'flying' | 'stationary'

/** Stage of the running attack: telegraph, active (after execute), recovery. */
export type GuardianAttackStage = 'windup' | 'active' | 'recovery'

/**
 * One attack in a guardian's repertoire. The scheduler picks a ready attack
 * (cooldown elapsed, player within range, allowed in the current phase,
 * `canUse()`), weighted by `weight`; the guardian winds up (telegraph -
 * animate it), calls `execute()`, stays in the active stage for `duration`
 * (calling `update`), then recovers. One attack runs at a time, with at
 * least the config's `attackCooldown` between attacks.
 */
export interface GuardianAttack {
  /** Unique within the guardian (read it in updateAnimations via `activeAttackId`). */
  readonly id: string
  /** Seconds before this attack can be picked again (counted from its start). */
  readonly cooldown: number
  /** Seconds after engaging (each fight) before the first use. Default 0. */
  readonly initialCooldown?: number
  /** Telegraph time before `execute()`. Default 0.6. */
  readonly windup?: number
  /** Active (channelled) time after `execute()`, `update()` runs every frame. Default 0. */
  readonly duration?: number
  /** Recovery after the active stage (a punish window). Default 0.4. */
  readonly recovery?: number
  /** Usable when the player is at least this far (horizontal, centre to centre). Default 0. */
  readonly minRange?: number
  /** Usable when the player is at most this far. Default: the config's attackRange. */
  readonly maxRange?: number
  /** Only in these phases (0 = full health). Default: every phase. */
  readonly phases?: readonly number[]
  /** Relative pick weight among ready attacks. Default 1. */
  readonly weight?: number
  /** Only when the guardian can see the player (no solid block in between). Default false. */
  readonly requiresLineOfSight?: boolean
  /** Keep turning toward the player during the windup. Default true. */
  readonly trackDuringWindup?: boolean
  /** Keep moving (default movement) while the attack runs. Default false (stands still). */
  readonly allowMovement?: boolean
  /** Extra condition (e.g. `this.minionCount < 3`). */
  canUse?(): boolean
  /** Windup begins (start telegraph effects). */
  onStart?(): void
  /** The attack lands: deal damage, fire projectiles, spawn minions... */
  execute(): void
  /** Every frame of the active stage. `elapsed` = seconds since execute(). */
  update?(deltaTime: number, elapsed: number): void
  /** The attack finished, or was cancelled (phase change, disengage, death). */
  onEnd?(cancelled: boolean): void
}

/** Guardian construction config. Ranges in blocks, times in seconds. */
export interface GuardianConfig
  extends Omit<
    IAggressiveEntityConfig,
    'aggressionMode' | 'fleeSpeed' | 'fleeDuration' | 'hasPhysics' | 'hitboxSize' | 'maxHealth' | 'detectionRange' | 'aggroTimeout' | 'provokedDuration' | 'knockbackStunTime' | 'drops'
  > {
  /** Stable id ('pyre_tyrant'): entity `type` and `guardian-defeated.guardianId`. */
  guardianId: string
  /** Boss bar name. */
  displayName: string
  /** 350-550 per DESIGN §7. */
  maxHealth: number
  /** Physics/hit box (width, height, depth). */
  hitboxSize: THREE.Vector3
  /** Loot when defeated (see guardianDrop()): a reward chest by the spent altar, else spilled on the floor. */
  drops?: IEntityDrop[]
  /** Arena (leash) centre. Default: `position`. */
  home?: THREE.Vector3
  /** Horizontal leash radius around home: the guardian never leaves it; the player leaving it ends the fight. Default 20. */
  arenaRadius?: number
  /** Max |player Y - home Y| to count as inside the arena. Default 12. */
  arenaHeight?: number
  /** Seconds the player must stay outside the arena before the guardian resets. Default 3. */
  disengageDelay?: number
  /** Health regained per second while reset (out of combat). Default maxHealth / 20. */
  regenPerSecond?: number
  /** Health fractions where phases change, e.g. [0.66, 0.33] -> phases 0, 1, 2. Default [0.5]. */
  phaseThresholds?: readonly number[]
  /** Invulnerable pause on each phase change (roar/transform). Default 1.2; 0 = none. */
  phaseTransitionTime?: number
  /** 0-1: fraction of player-hit knockback ignored. Default 0.85. */
  knockbackResistance?: number
  /** AI pause on hit (flinch); never more often than every 2 s. Default 0 (never flinches). */
  hitStunTime?: number
  /** Multiplier on all damage taken (armour-like). Default 1. */
  damageTakenMultiplier?: number
  /** Movement model. Default 'ground'. 'flying' ignores gravity and hovers above the player. */
  movement?: GuardianMovement
  /** Flying: hover height above the player's feet. Default 3. */
  hoverHeight?: number
  /** Distance kept from the player while no attack runs. Default attackRange * 0.8. */
  preferredRange?: number
  /** Turn rate, rad/s. Default 5. */
  turnSpeed?: number
  /** Most live minions at once (spawnMinion refuses beyond). Default 6. */
  maxMinions?: number
  /** Boss bar fill colour (#rrggbb). Default '#b8321e'. */
  bossBarColor?: string
  /** Death animation length before the body vanishes. Default 2.5. */
  deathDuration?: number
  /** Projectile spawn point, local to the guardian's feet (+Z = facing). Default (0, 0.65·height, 0.3·depth). */
  projectileOrigin?: THREE.Vector3
}

/** spawnProjectile() options: ProjectileOptions minus what the guardian aims for you. */
export interface GuardianProjectileOptions extends Omit<ProjectileOptions, 'position' | 'velocity' | 'owner'> {
  /** Spawn point. Default getProjectileOrigin(). */
  from?: THREE.Vector3
  /** Aim point. Default the player's chest. */
  target?: THREE.Vector3
  /** Speed (blocks/s); for lobs (`gravity` > 0) the horizontal speed. Default 14. */
  speed?: number
  /** Explicit velocity (skips aiming). */
  velocity?: THREE.Vector3
  /** Rotate the aim around the vertical axis (radians) - fans, flanking shots. */
  yawOffset?: number
  /** Raise (+) or lower (-) the aim (radians); straight shots only. */
  pitchOffset?: number
  /** Random aim deviation: half-angle of a cone, radians. Default 0. */
  spread?: number
}

/** Callbacks from a guardian to the spawner that summoned it (src/dungeons). */
export interface GuardianSpawnLink {
  /**
   * The guardian's health hit 0 (once). `loot` is its rolled drops; return
   * true when the spawner took them (reward chest by the spent altar),
   * false to have the guardian spill them on the floor when its body fades.
   */
  onGuardianDefeated(guardian: GuardianEntity, loot: IItem[]): boolean
  /** The guardian left the world (defeated or not). */
  onGuardianRemoved(guardian: GuardianEntity): void
}

/**
 * A drop for `GuardianConfig.drops` by item id (another stream's item works
 * through the item registry; unknown ids are skipped with a warning).
 */
export function guardianDrop(itemId: string, minCount = 1, maxCount = minCount): IEntityDrop {
  return { createItem: () => createItemFromId(itemId) as IItem, minCount, maxCount }
}

const engagedGuardians = new Set<GuardianEntity>()

/** Guardians currently fighting the player (boss bar candidates). */
export function getEngagedGuardians(): ReadonlySet<GuardianEntity> {
  return engagedGuardians
}

/** Seconds of immunity to another flinch after one. */
const STUN_IMMUNITY = 2
/** Hurt flash length, seconds. */
const HURT_FLASH_TIME = 0.18
/** Emissive flash of a hit that lands (blocked hits flash grey instead) */
const HURT_FLASH_COLOR = new THREE.Color(0.6, 0.08, 0.04)
/** Height of the player's chest/eyes above the feet. */
const PLAYER_CHEST = 1.1
const PLAYER_EYE = 1.62

export abstract class GuardianEntity extends AggressiveEntity implements BossBarTarget {
  readonly type: string
  readonly guardianId: string
  readonly displayName: string
  readonly bossBarColor: string
  readonly phaseThresholds: readonly number[]
  /** Arena centre (leash home). */
  readonly home: THREE.Vector3

  protected readonly arenaRadius: number
  protected readonly arenaHeight: number
  protected readonly movement: GuardianMovement
  protected readonly hoverHeight: number
  protected readonly preferredRange: number
  protected readonly hitboxSize: THREE.Vector3

  private readonly disengageDelay: number
  private readonly regenPerSecond: number
  private readonly phaseTransitionTime: number
  private readonly knockbackResistance: number
  private readonly hitStunTime: number
  private readonly damageTakenMultiplier: number
  private readonly turnSpeed: number
  private readonly maxMinions: number
  private readonly deathDuration: number
  private readonly projectileOriginLocal: THREE.Vector3
  private readonly guardianDrops: IEntityDrop[]

  // Combat state
  private _phase = 0
  private engaged = false
  private outsideTimer = 0
  private strayTimer = 0
  private transitionTimer = 0
  private invulnerableTimer = 0
  private stunTimer = 0
  private stunImmunityTimer = 0
  private defeated = false
  /** Rolled drops still to spill (null: none, spilled, or taken by the spawner). */
  private unclaimedLoot: IItem[] | null = null
  private dismissed = false
  private removedNotified = false

  // Attack scheduler
  private attacks: GuardianAttack[] | null = null
  private readonly attackCooldowns = new Map<string, number>()
  private currentAttack: GuardianAttack | null = null
  private stage: GuardianAttackStage | null = null
  private stageTime = 0

  // Facing (radians around Y; 0 = +Z)
  protected facing = 0

  // Hurt flash on registered (lit) materials
  private readonly flashMaterials: Array<{ material: THREE.MeshLambertMaterial; base: THREE.Color }> = []
  /** 1 right after a hit, fading to 0 - usable in updateAnimations. */
  protected hurtFlash = 0
  /** Colour of the flash currently fading out (hurt red, or a blocked-hit grey) */
  private readonly flashColor = new THREE.Color()

  // Wiring (EntityManager duck-typed setters)
  private playerRef: THREE.Vector3 | null = null
  private damageCallback: ((damage: number, knockback: THREE.Vector3, source?: DamageSource) => void) | null = null
  private solidQueryFn: ((x: number, y: number, z: number) => boolean) | null = null
  private blockQueryFn: ((x: number, y: number, z: number) => number) | null = null
  private entitySpawnFn: ((entity: IEntity) => boolean) | null = null
  private entityRemoveFn: ((entityId: EntityId) => boolean) | null = null
  private spawnLink: GuardianSpawnLink | null = null

  private readonly minions = new Set<IEntity>()
  /** Entities the minions spawned (split slimes, shardling fragments): cleared with them, not counted. */
  private readonly offspring = new Set<IEntity>()
  private readonly projectiles = new Set<ProjectileEntity>()
  private pruneTimer = 0

  // Ground movement stuck detection
  private readonly lastMovePosition = new THREE.Vector3()
  private moveStuckTime = 0
  private moveTriedJump = false

  // Scratch vectors
  private readonly tmpA = new THREE.Vector3()
  private readonly tmpB = new THREE.Vector3()
  private readonly tmpKnockback = new THREE.Vector3()

  constructor(config: GuardianConfig) {
    super(config.guardianId, {
      ...config,
      hasPhysics: true,
      aggressionMode: AggressionMode.ALWAYS_AGGRESSIVE,
      detectionRange: config.arenaRadius ?? 20,
      drops: [],
    })
    this.type = config.guardianId
    this.guardianId = config.guardianId
    this.displayName = config.displayName
    this.bossBarColor = config.bossBarColor ?? '#b8321e'
    this.phaseThresholds = [...(config.phaseThresholds ?? [0.5])].sort((a, b) => b - a)
    this.home = (config.home ?? config.position).clone()
    this.hitboxSize = config.hitboxSize.clone()

    this.arenaRadius = config.arenaRadius ?? 20
    this.arenaHeight = config.arenaHeight ?? 12
    this.disengageDelay = config.disengageDelay ?? 3
    this.regenPerSecond = config.regenPerSecond ?? config.maxHealth / 20
    this.phaseTransitionTime = config.phaseTransitionTime ?? 1.2
    this.knockbackResistance = THREE.MathUtils.clamp(config.knockbackResistance ?? 0.85, 0, 1)
    this.hitStunTime = config.hitStunTime ?? 0
    this.damageTakenMultiplier = config.damageTakenMultiplier ?? 1
    this.movement = config.movement ?? 'ground'
    this.hoverHeight = config.hoverHeight ?? 3
    this.preferredRange = config.preferredRange ?? this.attackRange * 0.8
    this.turnSpeed = config.turnSpeed ?? 5
    this.maxMinions = config.maxMinions ?? 6
    this.deathDuration = config.deathDuration ?? 2.5
    this.projectileOriginLocal =
      config.projectileOrigin?.clone() ??
      new THREE.Vector3(0, config.hitboxSize.y * 0.65, config.hitboxSize.z * 0.3)
    this.guardianDrops = config.drops ?? []

    if (this.movement === 'flying') {
      const body = this.getPhysicsBody()
      if (body) body.skipPhysics = true
    }
  }

  // =========================================================================
  // Subclass hooks
  // =========================================================================

  /**
   * The guardian's attacks (called once, lazily - arrow functions may use
   * `this`). Default: one melee swing using the config's attackRange,
   * attackDamage and attack knockback.
   */
  protected defineAttacks(): GuardianAttack[] {
    return [
      {
        id: 'melee',
        cooldown: this.attackCooldownDuration,
        windup: 0.5,
        maxRange: this.attackRange,
        execute: () => {
          this.meleeStrike()
        },
      },
    ]
  }

  /** Health crossed a phase threshold (phase increases by one per call). */
  protected onPhaseChanged(_phase: number, _previousPhase: number): void {}

  /** The player entered the arena (or hit the guardian): the fight starts. */
  protected onEngage(): void {}

  /** The player left the arena (or died): the guardian walks home and regenerates. */
  protected onDisengage(): void {}

  /** Fully regenerated after a disengage; phase is back to 0. */
  protected onReset(): void {}

  /** Health reached 0 (once). The death animation follows. */
  protected onDefeated(): void {}

  /** A hit landed while invulnerable (default: a pale flash). */
  protected onBlockedHit(): void {
    this.flash(0.35, 0.35, 0.4)
  }

  /**
   * Death animation, every frame for `deathDuration` seconds (t: 0 -> 1).
   * Default: topple over and sink.
   */
  protected updateDeathAnimation(_deltaTime: number, t: number): void {
    const mesh = this.getMesh()
    if (!mesh) return
    const fall = Math.min(1, t / 0.35)
    mesh.rotation.z = (1 - (1 - fall) * (1 - fall)) * (Math.PI / 2)
    mesh.position.y = this.position.y - Math.max(0, t - 0.35) * 0.8
  }

  /**
   * Combat AI while engaged (default: the attack scheduler, moving with
   * updateMovement() between attacks). Override for fully custom AI.
   */
  protected updateCombat(deltaTime: number): void {
    if (this.currentAttack) {
      this.advanceAttack(deltaTime)
      return
    }
    if (this.attackCooldown <= 0) {
      const attack = this.pickAttack()
      if (attack) {
        this.startAttack(attack)
        this.advanceAttack(0)
        return
      }
    }
    this.updateMovement(deltaTime)
  }

  /**
   * Movement between attacks (default: approach to `preferredRange` inside
   * the arena and face the player; stationary guardians only turn).
   */
  protected updateMovement(deltaTime: number): void {
    const player = this.playerRef
    if (!player) return
    this.faceToward(player, deltaTime)
    if (this.movement === 'stationary') {
      this.stopMoving()
      return
    }
    const target = this.clampToArena(this.tmpA.copy(player))
    if (this.movement === 'flying') {
      target.y = player.y + this.hoverHeight
      if (this.horizontalDistanceToPlayer() <= this.preferredRange) {
        target.x = this.position.x
        target.z = this.position.z
      }
      this.flyToward(target, this.chaseSpeed, deltaTime)
      return
    }
    if (this.horizontalDistanceToPlayer() > this.preferredRange) {
      this.moveToward(target, this.chaseSpeed, deltaTime)
    } else {
      this.stopMoving()
    }
  }

  // =========================================================================
  // State for animations / subclasses
  // =========================================================================

  /** 0 at full health; +1 per crossed phase threshold. */
  get phase(): number {
    return this._phase
  }

  get phaseCount(): number {
    return this.phaseThresholds.length + 1
  }

  get currentHealth(): number {
    return Math.max(0, this.health)
  }

  get healthFraction(): number {
    return Math.max(0, this.health) / this.maxHealth
  }

  /** Fighting the player (boss bar shown). */
  get isEngaged(): boolean {
    return this.engaged
  }

  /** Health reached 0 (dying or gone). */
  get isDefeated(): boolean {
    return this.defeated
  }

  /** Hits do no damage right now (invulnerability window or phase transition). */
  get isInvulnerable(): boolean {
    return this.invulnerableTimer > 0 || this.transitionTimer > 0
  }

  /** In the invulnerable pause after a phase change. */
  get isTransitioning(): boolean {
    return this.transitionTimer > 0
  }

  /** Id of the running attack, or null. */
  get activeAttackId(): string | null {
    return this.currentAttack?.id ?? null
  }

  /** Stage of the running attack, or null. */
  get attackStage(): GuardianAttackStage | null {
    return this.stage
  }

  /** Seconds into the current attack stage. */
  get attackStageTime(): number {
    return this.stageTime
  }

  /** 0-1 progress through the current attack stage (0 when none). */
  get attackStageProgress(): number {
    const attack = this.currentAttack
    if (!attack || !this.stage) return 0
    const length =
      this.stage === 'windup' ? (attack.windup ?? 0.6) : this.stage === 'active' ? (attack.duration ?? 0) : (attack.recovery ?? 0.4)
    return length > 0 ? Math.min(1, this.stageTime / length) : 1
  }

  /** Live minions spawned by this guardian. */
  get minionCount(): number {
    this.pruneOwned()
    return this.minions.size
  }

  /** The player's feet position (live reference - do not modify), or null before wiring. */
  protected get playerPosition(): THREE.Vector3 | null {
    return this.playerRef
  }

  // =========================================================================
  // Helpers for subclasses
  // =========================================================================

  /** Make hits do nothing for `seconds` (extends, never shortens, a running window). */
  protected setInvulnerable(seconds: number): void {
    this.invulnerableTimer = Math.max(this.invulnerableTimer, seconds)
  }

  /** Apply a status effect to the player (poison, slowness...). */
  protected applyEffectToPlayer(id: StatusEffectId, seconds: number, level = 1): void {
    playerEffects.apply(id, seconds, level)
  }

  /**
   * Damage the player directly. `knockback` pushes them away from the
   * guardian horizontally (blocks/s), `knockbackUp` lifts them.
   */
  protected damagePlayer(amount: number, knockback = 0, source: DamageSource = 'melee', knockbackUp?: number): void {
    const player = this.playerRef
    if (!player || !this.damageCallback) return
    const push = this.tmpKnockback.set(player.x - this.position.x, 0, player.z - this.position.z)
    if (push.lengthSq() > 1e-6) push.normalize()
    push.multiplyScalar(knockback)
    push.y = knockbackUp ?? (knockback > 0 ? Math.min(6, knockback * 0.6) : 0)
    this.damageCallback(amount, push, source)
  }

  /**
   * Melee hit if the player is within `reach` (horizontal, centre to centre),
   * vertically overlapping the guardian, and inside the frontal `arc`.
   * Defaults: attackDamage, attackRange + 0.5, attack knockback, arc π.
   * @returns whether it hit
   */
  protected meleeStrike(options: { damage?: number; reach?: number; knockback?: number; knockbackUp?: number; arc?: number } = {}): boolean {
    const player = this.playerRef
    if (!player) return false
    const reach = options.reach ?? this.attackRange + 0.5
    if (this.horizontalDistanceToPlayer() > reach) return false
    if (player.y > this.position.y + this.hitboxSize.y || player.y + 1.8 < this.position.y - 0.5) return false
    const arc = options.arc ?? Math.PI
    if (arc < Math.PI * 2) {
      const toPlayer = Math.atan2(player.x - this.position.x, player.z - this.position.z)
      if (Math.abs(angleDelta(this.facing, toPlayer)) > arc / 2) return false
    }
    this.damagePlayer(
      options.damage ?? this.attackDamage,
      options.knockback ?? this.attackKnockbackHorizontal,
      'melee',
      options.knockbackUp ?? this.attackKnockbackVertical
    )
    return true
  }

  /**
   * Area hit (slam, shockwave, explosion) centred at `center` (feet level):
   * hits if the player's feet are within `radius` horizontally and within
   * `height` (default 3) vertically.
   * @returns whether it hit
   */
  protected areaStrike(
    center: THREE.Vector3,
    radius: number,
    damage: number,
    options: { knockback?: number; knockbackUp?: number; height?: number; source?: DamageSource } = {}
  ): boolean {
    const player = this.playerRef
    if (!player) return false
    const dx = player.x - center.x
    const dz = player.z - center.z
    if (dx * dx + dz * dz > radius * radius) return false
    if (Math.abs(player.y - center.y) > (options.height ?? 3)) return false
    const push = this.tmpKnockback.set(dx, 0, dz)
    if (push.lengthSq() > 1e-6) push.normalize()
    push.multiplyScalar(options.knockback ?? 0)
    push.y = options.knockbackUp ?? ((options.knockback ?? 0) > 0 ? 4 : 0)
    this.damageCallback?.(damage, push, options.source ?? 'melee')
    return true
  }

  /** World position projectiles spawn from (projectileOrigin rotated by facing). */
  protected getProjectileOrigin(out = new THREE.Vector3()): THREE.Vector3 {
    const local = this.projectileOriginLocal
    const sin = Math.sin(this.facing)
    const cos = Math.cos(this.facing)
    return out.set(
      this.position.x + local.x * cos + local.z * sin,
      this.position.y + local.y,
      this.position.z - local.x * sin + local.z * cos
    )
  }

  /**
   * Fire a projectile at the player (or `target`). Straight shots fly at
   * `speed`; with `gravity` > 0 it is lobbed to land on the target with
   * `speed` as horizontal speed. Owned by this guardian (cleared when it
   * dies or resets). Returns null when it could not be spawned.
   */
  protected spawnProjectile(options: GuardianProjectileOptions): ProjectileEntity | null {
    if (!this.entitySpawnFn) return null
    const from = options.from?.clone() ?? this.getProjectileOrigin()
    const velocity = options.velocity?.clone() ?? this.aimVelocity(from, options)
    const projectile = new ProjectileEntity({ ...options, position: from, velocity, owner: this })
    if (!this.entitySpawnFn(projectile)) return null
    this.projectiles.add(projectile)
    return projectile
  }

  /** `count` projectiles spread evenly over `arc` radians, centred on the aim. */
  protected spawnProjectileFan(count: number, arc: number, options: GuardianProjectileOptions): ProjectileEntity[] {
    const fired: ProjectileEntity[] = []
    for (let i = 0; i < count; i++) {
      const offset = count > 1 ? -arc / 2 + (arc * i) / (count - 1) : 0
      const projectile = this.spawnProjectile({ ...options, yawOffset: (options.yawOffset ?? 0) + offset })
      if (projectile) fired.push(projectile)
    }
    return fired
  }

  /** `count` projectiles in a horizontal ring around the guardian (nova). */
  protected spawnProjectileRing(count: number, options: Omit<GuardianProjectileOptions, 'target' | 'velocity'>): ProjectileEntity[] {
    const fired: ProjectileEntity[] = []
    const speed = options.speed ?? 14
    const from = options.from ?? this.getProjectileOrigin()
    for (let i = 0; i < count; i++) {
      const angle = this.facing + (Math.PI * 2 * i) / count
      const velocity = new THREE.Vector3(Math.sin(angle) * speed, 0, Math.cos(angle) * speed)
      const projectile = this.spawnProjectile({ ...options, from: from.clone(), velocity })
      if (projectile) fired.push(projectile)
    }
    return fired
  }

  /**
   * Add a minion (any entity, usually an AggressiveEntity mob) to the world.
   * Refused (false) at `maxMinions` live minions. Minions are removed when
   * the guardian dies or resets.
   */
  protected spawnMinion(entity: IEntity): boolean {
    if (!this.entitySpawnFn || this.minionCount >= this.maxMinions) return false
    if (!this.entitySpawnFn(entity)) return false
    this.minions.add(entity)
    return true
  }

  /**
   * Remove every live minion and everything they spawned (split children,
   * fragments), including any still queued to enter the world (no drops).
   */
  protected clearMinions(): void {
    this.adoptOffspring()
    for (const owned of [this.minions, this.offspring]) {
      for (const entity of owned) {
        if (entity.state !== EntityState.DISPOSED) this.entityRemoveFn?.(entity.id)
      }
      owned.clear()
    }
  }

  /** Remove every projectile still in flight. */
  protected clearProjectiles(): void {
    for (const projectile of this.projectiles) projectile.destroy()
    this.projectiles.clear()
  }

  /** Horizontal distance to the player (Infinity before wiring). */
  protected horizontalDistanceToPlayer(): number {
    const player = this.playerRef
    if (!player) return Infinity
    return Math.hypot(player.x - this.position.x, player.z - this.position.z)
  }

  /** 3D distance between feet positions (Infinity before wiring). */
  protected distanceToPlayer(): number {
    return this.playerRef ? this.position.distanceTo(this.playerRef) : Infinity
  }

  /** Is the player inside this guardian's arena (and alive)? */
  protected isPlayerInArena(): boolean {
    const player = this.playerRef
    if (!player || getDungeonServices()?.isPlayerDead()) return false
    const dx = player.x - this.home.x
    const dz = player.z - this.home.z
    return dx * dx + dz * dz <= this.arenaRadius * this.arenaRadius && Math.abs(player.y - this.home.y) <= this.arenaHeight
  }

  /** No solid block between the projectile origin and the player's eyes. */
  protected canSeePlayer(): boolean {
    const player = this.playerRef
    if (!player) return false
    if (!this.solidQueryFn) return true
    const from = this.getProjectileOrigin(this.tmpA)
    const to = this.tmpB.set(player.x, player.y + PLAYER_EYE, player.z)
    const distance = from.distanceTo(to)
    const steps = Math.ceil(distance / 0.5)
    for (let i = 1; i < steps; i++) {
      const t = i / steps
      if (
        this.solidQueryFn(
          Math.floor(from.x + (to.x - from.x) * t),
          Math.floor(from.y + (to.y - from.y) * t),
          Math.floor(from.z + (to.z - from.z) * t)
        )
      ) {
        return false
      }
    }
    return true
  }

  /** Block id at a world position (0 = air/unknown before wiring). */
  protected blockAt(x: number, y: number, z: number): number {
    return this.blockQueryFn ? this.blockQueryFn(Math.floor(x), Math.floor(y), Math.floor(z)) : 0
  }

  /** Solid block at a world position (false before wiring). */
  protected isSolidAt(x: number, y: number, z: number): boolean {
    return this.solidQueryFn ? this.solidQueryFn(Math.floor(x), Math.floor(y), Math.floor(z)) : false
  }

  /** Clamp a point to the arena circle (horizontal), in place. */
  protected clampToArena(point: THREE.Vector3, margin = 1): THREE.Vector3 {
    const dx = point.x - this.home.x
    const dz = point.z - this.home.z
    const max = Math.max(0, this.arenaRadius - margin)
    const distance = Math.hypot(dx, dz)
    if (distance > max && distance > 0) {
      point.x = this.home.x + (dx / distance) * max
      point.z = this.home.z + (dz / distance) * max
    }
    return point
  }

  /** Turn toward `target` at the guardian's turn speed (rotates the mesh). */
  protected faceToward(target: THREE.Vector3, deltaTime: number): void {
    const dx = target.x - this.position.x
    const dz = target.z - this.position.z
    if (dx * dx + dz * dz < 1e-6) return
    const desired = Math.atan2(dx, dz)
    const delta = angleDelta(this.facing, desired)
    const step = this.turnSpeed * deltaTime
    this.facing = wrapAngle(this.facing + THREE.MathUtils.clamp(delta, -step, step))
  }

  /** Ground movement toward `target` (horizontal) with jump-when-stuck. */
  protected moveToward(target: THREE.Vector3, speed: number, deltaTime: number): void {
    const body = this.getPhysicsBody()
    if (!body) return
    if (this.movement === 'flying') {
      this.flyToward(target, speed, deltaTime)
      return
    }
    const dir = this.tmpB.set(target.x - this.position.x, 0, target.z - this.position.z)
    const distance = dir.length()
    if (distance < 0.3) {
      this.stopMoving()
      return
    }
    dir.divideScalar(distance)

    const moved = (this.position.x - this.lastMovePosition.x) * dir.x + (this.position.z - this.lastMovePosition.z) * dir.z
    if (this.isWalking && moved < speed * deltaTime * 0.2) {
      this.moveStuckTime += deltaTime
      if (this.moveStuckTime >= 0.3 && body.isOnGround) {
        if (!this.moveTriedJump) body.velocity.y = this.jumpVelocity
        this.moveTriedJump = !this.moveTriedJump
        this.moveStuckTime = 0
      }
    } else {
      this.moveStuckTime = 0
      if (body.isOnGround) this.moveTriedJump = false
    }
    this.lastMovePosition.copy(this.position)

    const step = Math.min(speed, distance / Math.max(deltaTime, 1e-3))
    body.velocity.x = dir.x * step
    body.velocity.z = dir.z * step
    this.isWalking = true
  }

  /** Flying movement toward `target` (3D), sliding around solid blocks. */
  protected flyToward(target: THREE.Vector3, speed: number, deltaTime: number): void {
    const body = this.getPhysicsBody()
    if (!body) return
    const delta = this.tmpB.copy(target).sub(body.position)
    const distance = delta.length()
    if (distance < 0.05) {
      this.isWalking = false
      return
    }
    const step = Math.min(distance, speed * deltaTime)
    delta.multiplyScalar(step / distance)
    const from = body.position
    // Try the full move, then each axis on its own (slide along walls). A
    // body already overlapping blocks (summoned into a tight spot) moves
    // freely until it is clear again, instead of being stuck forever.
    if (!this.flyClear(from.x, from.y, from.z) || this.flyClear(from.x + delta.x, from.y + delta.y, from.z + delta.z)) {
      from.add(delta)
    } else {
      if (this.flyClear(from.x, from.y + delta.y, from.z)) from.y += delta.y
      if (this.flyClear(from.x + delta.x, from.y, from.z)) from.x += delta.x
      if (this.flyClear(from.x, from.y, from.z + delta.z)) from.z += delta.z
    }
    body.velocity.set(0, 0, 0)
    this.isWalking = true
  }

  /** Stop horizontal movement. */
  protected stopMoving(): void {
    const body = this.getPhysicsBody()
    if (body && this.movement !== 'flying') {
      body.velocity.x = 0
      body.velocity.z = 0
    }
    this.isWalking = false
  }

  /** Cancel the running attack (calls its onEnd(true)). */
  protected cancelAttack(): void {
    const attack = this.currentAttack
    if (!attack) return
    this.currentAttack = null
    this.stage = null
    this.stageTime = 0
    attack.onEnd?.(true)
  }

  // =========================================================================
  // Spawner / EntityManager wiring
  // =========================================================================

  /** Bind to the spawner that summoned it (src/dungeons). */
  attachSpawnLink(link: GuardianSpawnLink | null): void {
    this.spawnLink = link
  }

  /**
   * Vanish without being defeated (spawner unloaded, reset by the system):
   * no loot, no event; the spawner re-arms.
   */
  dismiss(): void {
    if (this.defeated) return
    this.dismissed = true
    this.entityRemoveFn?.(this.id)
  }

  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    super.setPlayerPositionRef(positionRef)
    this.playerRef = positionRef
  }

  setPlayerDamageCallback(callback: (damage: number, knockback: THREE.Vector3, source?: DamageSource) => void): void {
    super.setPlayerDamageCallback(callback)
    this.damageCallback = callback
  }

  setWorldQueryFns(
    blockQuery: (x: number, y: number, z: number) => number,
    solidQuery: (x: number, y: number, z: number) => boolean
  ): void {
    this.blockQueryFn = blockQuery
    this.solidQueryFn = solidQuery
  }

  setEntitySpawnFn(spawn: (entity: IEntity) => boolean): void {
    this.entitySpawnFn = spawn
  }

  setEntityRemoveFn(remove: (entityId: EntityId) => boolean): void {
    this.entityRemoveFn = remove
  }

  // =========================================================================
  // Damage
  // =========================================================================

  /**
   * Damage the guardian (player melee goes through here; other systems may
   * call it too). Ignored while invulnerable or dying.
   * @param from Where the hit came from (knockback direction), optional
   * @returns whether damage was dealt
   */
  applyDamage(amount: number, from?: THREE.Vector3): boolean {
    if (!this.isAlive || this._isDying || this.dismissed) return false
    if (!this.engaged) this.engage()
    if (this.isInvulnerable) {
      this.onBlockedHit()
      return false
    }
    const damage = amount * this.damageTakenMultiplier
    if (!(damage > 0)) return false
    this.health -= damage
    this.flash(HURT_FLASH_COLOR.r, HURT_FLASH_COLOR.g, HURT_FLASH_COLOR.b)

    if (from) {
      const body = this.getPhysicsBody()
      const push = this.tmpKnockback.set(this.position.x - from.x, 0, this.position.z - from.z)
      if (body && this.movement === 'ground' && push.lengthSq() > 1e-6) {
        const scale = 1 - this.knockbackResistance
        push.normalize()
        body.velocity.x += push.x * this.knockbackHorizontal * scale
        body.velocity.z += push.z * this.knockbackHorizontal * scale
        if (scale > 0 && body.isOnGround) body.velocity.y = Math.max(body.velocity.y, this.knockbackVertical * scale)
      }
    }

    if (this.health <= 0) {
      this.beginDeath()
      return true
    }

    if (this.hitStunTime > 0 && this.stunImmunityTimer <= 0) {
      this.stunTimer = this.hitStunTime
      this.stunImmunityTimer = STUN_IMMUNITY
    }
    this.updatePhase()
    return true
  }

  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick || !this.isAlive || this._isDying) return false
    this.applyDamage(getPlayerAttackDamage(heldItem), playerPosition)
    return true
  }

  /** Reach is measured to the hitbox surface, not the feet (big bodies). */
  canPlayerInteract(playerPosition: THREE.Vector3, maxDistance: number): boolean {
    if (!this.isAlive || this._isDying) return false
    const hx = this.hitboxSize.x / 2
    const hz = this.hitboxSize.z / 2
    const cx = THREE.MathUtils.clamp(playerPosition.x, this.position.x - hx, this.position.x + hx)
    const cy = THREE.MathUtils.clamp(playerPosition.y, this.position.y, this.position.y + this.hitboxSize.y)
    const cz = THREE.MathUtils.clamp(playerPosition.z, this.position.z - hz, this.position.z + hz)
    const dx = playerPosition.x - cx
    const dy = playerPosition.y - cy
    const dz = playerPosition.z - cz
    return dx * dx + dy * dy + dz * dz <= maxDistance * maxDistance
  }

  /** Loot goes to a reward chest by the spent altar, or is spilled on the floor (never lost to a full inventory), so nothing goes straight to the inventory. */
  getDrops(): IItem[] {
    return []
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  protected registerMaterialForLighting(material: THREE.MeshLambertMaterial): void {
    super.registerMaterialForLighting(material)
    if (!this.flashMaterials.some((entry) => entry.material === material)) {
      this.flashMaterials.push({ material, base: material.emissive.clone() })
    }
  }

  onSpawn(): void {
    super.onSpawn()
    this.lastMovePosition.copy(this.position)
    if (this.playerRef) {
      this.facing = Math.atan2(this.playerRef.x - this.position.x, this.playerRef.z - this.position.z)
    }
  }

  update(deltaTime: number): void {
    const body = this.getPhysicsBody()
    if (body) this.position.copy(body.position)

    if (this.dismissed) {
      this.kill()
      return
    }

    this.tickTimers(deltaTime)

    // Drop dead minions/projectiles (and pick up what minions spawned) now
    // and then, not only when an attack asks for minionCount
    this.pruneTimer -= deltaTime
    if (this.pruneTimer <= 0) {
      this.pruneTimer = 0.5
      this.pruneOwned()
    }

    if (this._isDying) {
      this.deathTimer += deltaTime
      if (body) {
        body.velocity.x = 0
        body.velocity.z = 0
      }
      this.syncMesh()
      this.updateDeathAnimation(deltaTime, Math.min(1, this.deathTimer / this.deathDuration))
      this.updateHurtFlash(deltaTime)
      if (this.deathTimer >= this.deathDuration) {
        this.spillDrops()
        this.kill()
      }
      return
    }

    this.updateEngagement(deltaTime)
    this.keepInArena(deltaTime)

    if (this.stunTimer > 0 || this.transitionTimer > 0) {
      this.stopMoving()
      if (this.transitionTimer > 0 && this.playerRef) this.faceToward(this.playerRef, deltaTime)
    } else if (this.engaged) {
      this.updateCombat(deltaTime)
    } else {
      this.updateReturnHome(deltaTime)
    }

    this.updateHurtFlash(deltaTime)
    this.updateAnimations(deltaTime)
    this.syncMesh()
  }

  onDespawn(): boolean {
    engagedGuardians.delete(this)
    this.engaged = false
    this.clearMinions()
    this.clearProjectiles()
    if (this.defeated) this.spillDrops()
    if (!this.removedNotified) {
      this.removedNotified = true
      this.spawnLink?.onGuardianRemoved(this)
    }
    return true
  }

  dispose(): void {
    engagedGuardians.delete(this)
    this.flashMaterials.length = 0
    this.playerRef = null
    this.damageCallback = null
    this.solidQueryFn = null
    this.blockQueryFn = null
    this.entitySpawnFn = null
    this.entityRemoveFn = null
    this.spawnLink = null
    super.dispose()
  }

  // =========================================================================
  // Internals
  // =========================================================================

  private tickTimers(deltaTime: number): void {
    this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime)
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - deltaTime)
    this.transitionTimer = Math.max(0, this.transitionTimer - deltaTime)
    this.stunTimer = Math.max(0, this.stunTimer - deltaTime)
    this.stunImmunityTimer = Math.max(0, this.stunImmunityTimer - deltaTime)
    if (this.engaged) {
      for (const [id, remaining] of this.attackCooldowns) {
        if (remaining > 0) this.attackCooldowns.set(id, Math.max(0, remaining - deltaTime))
      }
    }
  }

  private syncMesh(): void {
    const mesh = this.getMesh()
    if (!mesh) return
    mesh.position.copy(this.position)
    if (!this._isDying) mesh.rotation.y = this.facing
  }

  private engage(): void {
    if (this.engaged || this._isDying) return
    this.engaged = true
    this.outsideTimer = 0
    engagedGuardians.add(this)
    // Each fight opens with the attacks' initial cooldowns
    for (const attack of this.getAttacks()) {
      const initial = attack.initialCooldown ?? 0
      if ((this.attackCooldowns.get(attack.id) ?? 0) < initial) this.attackCooldowns.set(attack.id, initial)
    }
    this.onEngage()
  }

  private disengage(): void {
    if (!this.engaged) return
    this.engaged = false
    engagedGuardians.delete(this)
    this.cancelAttack()
    this.clearMinions()
    this.onDisengage()
  }

  private updateEngagement(deltaTime: number): void {
    const inArena = this.isPlayerInArena()
    if (!this.engaged) {
      if (inArena) this.engage()
      return
    }
    if (inArena) {
      this.outsideTimer = 0
    } else {
      this.outsideTimer += deltaTime
      if (this.outsideTimer >= this.disengageDelay) this.disengage()
    }
  }

  /** Walk home and regenerate while not fighting. */
  private updateReturnHome(deltaTime: number): void {
    if (this.movement === 'stationary') {
      this.stopMoving()
    } else {
      const target = this.tmpA.copy(this.home)
      if (this.movement === 'flying') target.y += this.hoverHeight
      const dx = target.x - this.position.x
      const dz = target.z - this.position.z
      const far = dx * dx + dz * dz > 1 || (this.movement === 'flying' && Math.abs(target.y - this.position.y) > 0.5)
      if (far) {
        this.faceToward(target, deltaTime)
        this.moveToward(target, Math.max(this.walkSpeed, this.chaseSpeed * 0.75), deltaTime)
      } else {
        this.stopMoving()
      }
    }

    if (this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + this.regenPerSecond * deltaTime)
      if (this.health >= this.maxHealth && this._phase !== 0) {
        this._phase = 0
        this.attackCooldowns.clear()
        this.onReset()
      }
    }
  }

  /** A guardian knocked or fallen far out of its arena is put back home. */
  private keepInArena(deltaTime: number): void {
    const dx = this.position.x - this.home.x
    const dz = this.position.z - this.home.z
    const outside =
      dx * dx + dz * dz > (this.arenaRadius + 6) * (this.arenaRadius + 6) ||
      Math.abs(this.position.y - this.home.y) > this.arenaHeight + 6
    this.strayTimer = outside ? this.strayTimer + deltaTime : 0
    if (this.strayTimer < 3) return
    this.strayTimer = 0
    const body = this.getPhysicsBody()
    if (!body) return
    body.position.copy(this.home)
    if (this.movement === 'flying') body.position.y += this.hoverHeight
    body.velocity.set(0, 0, 0)
    this.position.copy(body.position)
  }

  private updatePhase(): void {
    const fraction = this.healthFraction
    let target = 0
    while (target < this.phaseThresholds.length && fraction <= this.phaseThresholds[target]) target++
    while (this._phase < target) {
      const previous = this._phase
      this._phase++
      if (this.phaseTransitionTime > 0) {
        this.cancelAttack()
        this.transitionTimer = this.phaseTransitionTime
      }
      this.onPhaseChanged(this._phase, previous)
    }
  }

  private beginDeath(): void {
    this.health = 0
    this._isDying = true
    this.deathTimer = 0
    this.isAggressive = false
    this.cancelAttack()
    this.stopMoving()
    engagedGuardians.delete(this)
    this.engaged = false
    const body = this.getPhysicsBody()
    if (body) {
      body.skipPhysics = false
      body.velocity.set(0, 0, 0)
    }

    if (this.defeated) return
    this.defeated = true
    this.clearMinions()
    this.clearProjectiles()
    gameEvents.emit({
      type: 'guardian-defeated',
      guardianId: this.guardianId,
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
    })
    // The spawner stores the loot in a reward chest beside the spent altar
    // (both written now, so they persist together); otherwise it spills on
    // the floor when the body fades
    const loot = this.rollLoot()
    const stored = this.spawnLink?.onGuardianDefeated(this, loot) ?? false
    this.unclaimedLoot = stored ? null : loot
    this.onDefeated()
  }

  private rollLoot(): IItem[] {
    const items: IItem[] = []
    for (const drop of this.guardianDrops) {
      const min = drop.minCount ?? 1
      const max = drop.maxCount ?? min
      const count = min + Math.floor(Math.random() * (max - min + 1))
      for (let i = 0; i < count; i++) {
        const item = drop.createItem()
        if (item) items.push(item)
      }
    }
    return items
  }

  private spillDrops(): void {
    const items = this.unclaimedLoot
    this.unclaimedLoot = null
    if (!items || items.length === 0) return
    const services = getDungeonServices()
    if (!services) {
      console.warn(`[GuardianEntity] ${this.guardianId}: no dungeon services - ${items.length} drops lost`)
      return
    }
    services.spawnDrops(items, this.position.x, this.position.y + 0.5, this.position.z)
  }

  private getAttacks(): GuardianAttack[] {
    this.attacks ??= this.defineAttacks()
    return this.attacks
  }

  private pickAttack(): GuardianAttack | null {
    if (!this.playerRef) return null
    const distance = this.horizontalDistanceToPlayer()
    let total = 0
    const ready: GuardianAttack[] = []
    for (const attack of this.getAttacks()) {
      if ((this.attackCooldowns.get(attack.id) ?? 0) > 0) continue
      if (attack.phases && !attack.phases.includes(this._phase)) continue
      if (distance < (attack.minRange ?? 0) || distance > (attack.maxRange ?? this.attackRange)) continue
      if (attack.canUse && !attack.canUse()) continue
      if (attack.requiresLineOfSight && !this.canSeePlayer()) continue
      ready.push(attack)
      total += attack.weight ?? 1
    }
    if (ready.length === 0) return null
    let roll = Math.random() * total
    for (const attack of ready) {
      roll -= attack.weight ?? 1
      if (roll <= 0) return attack
    }
    return ready[ready.length - 1]
  }

  private startAttack(attack: GuardianAttack): void {
    this.currentAttack = attack
    this.stage = 'windup'
    this.stageTime = 0
    this.attackCooldowns.set(attack.id, attack.cooldown)
    attack.onStart?.()
  }

  private advanceAttack(deltaTime: number): void {
    const attack = this.currentAttack
    if (!attack) return
    const player = this.playerRef

    if (attack.allowMovement) {
      this.updateMovement(deltaTime)
    } else {
      this.stopMoving()
      if (this.stage === 'windup' && attack.trackDuringWindup !== false && player) this.faceToward(player, deltaTime)
    }

    this.stageTime += deltaTime
    if (this.stage === 'windup' && this.stageTime >= (attack.windup ?? 0.6)) {
      this.stage = 'active'
      this.stageTime = 0
      attack.execute()
      if (this.currentAttack !== attack) return // cancelled by execute (e.g. killed a phase)
    }
    if (this.stage === 'active') {
      if (this.stageTime > 0) attack.update?.(deltaTime, this.stageTime)
      if (this.currentAttack !== attack) return
      if (this.stageTime >= (attack.duration ?? 0)) {
        this.stage = 'recovery'
        this.stageTime = 0
      }
    }
    if (this.stage === 'recovery' && this.stageTime >= (attack.recovery ?? 0.4)) {
      this.currentAttack = null
      this.stage = null
      this.stageTime = 0
      this.attackCooldown = this.attackCooldownDuration
      attack.onEnd?.(false)
    }
  }

  private aimVelocity(from: THREE.Vector3, options: GuardianProjectileOptions): THREE.Vector3 {
    const speed = options.speed ?? 14
    const target = options.target?.clone() ?? (this.playerRef ? this.tmpA.set(this.playerRef.x, this.playerRef.y + PLAYER_CHEST, this.playerRef.z).clone() : null)
    let yaw = this.facing
    let horizontal = 10
    let dy = 0
    if (target) {
      const dx = target.x - from.x
      const dz = target.z - from.z
      horizontal = Math.hypot(dx, dz)
      dy = target.y - from.y
      if (horizontal > 1e-3) yaw = Math.atan2(dx, dz)
    }
    yaw += options.yawOffset ?? 0
    if (options.spread) yaw += (Math.random() * 2 - 1) * options.spread

    const gravity = options.gravity ?? 0
    if (gravity > 0) {
      // Lob: fly `horizontal` blocks at `speed` and land on the target height
      const time = Math.max(0.35, horizontal / speed)
      const vy = (dy + 0.5 * gravity * time * time) / time
      return new THREE.Vector3(Math.sin(yaw) * speed, vy, Math.cos(yaw) * speed)
    }

    let pitch = Math.atan2(dy, Math.max(horizontal, 1e-3)) + (options.pitchOffset ?? 0)
    if (options.spread) pitch += (Math.random() * 2 - 1) * options.spread
    const cosPitch = Math.cos(pitch)
    return new THREE.Vector3(Math.sin(yaw) * cosPitch * speed, Math.sin(pitch) * speed, Math.cos(yaw) * cosPitch * speed)
  }

  private flyClear(x: number, y: number, z: number): boolean {
    const hx = this.hitboxSize.x / 2 - 0.05
    const hz = this.hitboxSize.z / 2 - 0.05
    const top = y + this.hitboxSize.y - 0.05
    for (const py of [y + 0.05, (y + top) / 2, top]) {
      for (const [px, pz] of [[x, z], [x - hx, z - hz], [x + hx, z - hz], [x - hx, z + hz], [x + hx, z + hz]]) {
        if (this.isSolidAt(px, py, pz)) return false
      }
    }
    return true
  }

  private flash(r: number, g: number, b: number): void {
    this.hurtFlash = 1
    this.flashColor.setRGB(r, g, b)
  }

  private updateHurtFlash(deltaTime: number): void {
    if (this.hurtFlash <= 0 || this.flashMaterials.length === 0) {
      this.hurtFlash = 0
      return
    }
    this.hurtFlash = Math.max(0, this.hurtFlash - deltaTime / HURT_FLASH_TIME)
    const k = this.hurtFlash
    for (const { material, base } of this.flashMaterials) {
      material.emissive.setRGB(
        base.r + this.flashColor.r * k,
        base.g + this.flashColor.g * k,
        base.b + this.flashColor.b * k
      )
    }
  }

  private pruneOwned(): void {
    this.adoptOffspring()
    for (const owned of [this.minions, this.offspring]) {
      for (const entity of owned) {
        if (!entity.isAlive || entity.state === EntityState.DISPOSED) owned.delete(entity)
      }
    }
    for (const projectile of this.projectiles) {
      if (!projectile.isAlive || projectile.state === EntityState.DISPOSED) this.projectiles.delete(projectile)
    }
  }

  /** Track what minions (and their offspring, recursively) spawned. */
  private adoptOffspring(): void {
    for (const owned of [this.minions, this.offspring]) {
      for (const entity of owned) {
        const children = entity.spawnedChildren
        if (!children) continue
        for (const child of children) {
          if (child.state !== EntityState.DISPOSED && !this.minions.has(child)) this.offspring.add(child)
        }
      }
    }
  }
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

/** Signed shortest rotation from `from` to `to`, radians. */
function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from)
}
