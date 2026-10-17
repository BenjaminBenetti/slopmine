import * as THREE from 'three'
import { GuardianEntity, guardianDrop, type GuardianAttack } from '../GuardianEntity.ts'
import { StatusEffectIds } from '../../../player/effects/StatusEffects.ts'
import { IceRevenantEntity } from '../../enemies/ice_revenant/IceRevenantEntity.ts'
import { optimizeEntityMesh } from '../../EntityMeshOptimizer.ts'
import { buildRimeSovereignModel, type RimeSovereignModel } from './RimeSovereignModel.ts'

/** Frost nova reach (blocks): step out of the telegraphed ring to dodge it. */
const NOVA_RADIUS = 7
/** Damage taken while encased in ice armour. */
const ARMOR_DAMAGE_FACTOR = 0.3
/** While armoured he keeps up a slow shard barrage: one shard per this many seconds. */
const ARMOR_SHARD_INTERVAL = 1.4
/** Default arena (leash) radius when no citadel hall is known. */
const DEFAULT_ARENA_RADIUS = 13

/**
 * The Rime Sovereign - guardian of the Frozen Citadel (Cocytus, index 5).
 * A crowned frozen tyrant with a rime-crystal scepter.
 *
 * Attacks (all telegraphed):
 * - Glacial Cleave: scepter raised overhead, then a wide frontal sweep (13).
 * - Shard Volley: scepter crystal flares, then a fan of ice shards (8 each,
 *   2 s Frostbite); 7 shards from phase 2.
 * - Frost Nova: a frost ring grows on the floor for 1.4 s, then everything
 *   inside takes 11 (magic) and Frostbite II; in phase 2 also a ring of shards.
 * - Summon Revenants (phases 1-2): two Ice Revenants tear out of the ice.
 * - Ice Armour (phases 1-2): encased in ice for 6 s, taking 30% damage and
 *   loosing a shard every 1.4 s; when it shatters he staggers for 2.5 s
 *   (long recovery = punish window).
 * Phases at 66% and 33% health; each phase change chills the player.
 * Drops (into the reward chest): 2 rime sigils, Infernal Heart, rime crystals,
 * diamonds, frost lanterns.
 */
export class RimeSovereignEntity extends GuardianEntity {
  private model: RimeSovereignModel | null = null
  private armored = false
  private armorShards = 0
  private animTime = 0

  /**
   * @param position Feet position (the top of the altar).
   * @param arena Arena (leash) centre and radius - the throne hall when the
   *   altar stands in a Frozen Citadel; else around the spawn point.
   */
  constructor(position: THREE.Vector3, arena?: { home: THREE.Vector3; radius: number }) {
    super({
      position,
      home: arena?.home,
      guardianId: 'rime_sovereign',
      displayName: 'The Rime Sovereign',
      maxHealth: 500,
      hitboxSize: new THREE.Vector3(1.6, 3.3, 1.6),
      chaseSpeed: 2.8,
      walkSpeed: 1.6,
      attackRange: 3.2,
      attackDamage: 12,
      attackKnockbackHorizontal: 8,
      attackKnockbackVertical: 4,
      attackCooldown: 0.9,
      phaseThresholds: [0.66, 0.33],
      arenaRadius: arena?.radius ?? DEFAULT_ARENA_RADIUS,
      arenaHeight: 10,
      knockbackResistance: 0.92,
      bossBarColor: '#7fd8f0',
      projectileOrigin: new THREE.Vector3(0.75, 2.7, 1.2),
      drops: [
        guardianDrop('rime_sigil', 2, 2),
        guardianDrop('infernal_heart'),
        guardianDrop('rime_crystal', 4, 8),
        guardianDrop('diamond', 1, 3),
        guardianDrop('frost_lantern_block', 2, 3),
      ],
    })
  }

  protected createMesh(): THREE.Object3D {
    const model = buildRimeSovereignModel()
    this.model = model
    for (const m of model.litMaterials) this.registerMaterialForLighting(m)
    optimizeEntityMesh(model.root, {
      merge: true,
      dynamic: [model.upper, model.leftArm, model.rightArm, model.leftLeg, model.rightLeg, model.cape, model.iceArmor, model.novaRing],
      registerForLighting: (m) => this.registerMaterialForLighting(m),
    })
    return model.root
  }

  /** Ice armour: hits land, but only for a fraction of their damage. */
  override applyDamage(amount: number, from?: THREE.Vector3): boolean {
    return super.applyDamage(this.armored ? amount * ARMOR_DAMAGE_FACTOR : amount, from)
  }

  protected defineAttacks(): GuardianAttack[] {
    return [
      {
        id: 'glacial_cleave', cooldown: 3.5, windup: 0.75, recovery: 0.6, maxRange: 3.8,
        execute: () => { this.meleeStrike({ damage: 13, reach: 4, arc: Math.PI * 0.8, knockback: 9 }) },
      },
      {
        id: 'shard_volley', cooldown: 5, windup: 0.9, minRange: 2.5, maxRange: 26, requiresLineOfSight: true,
        execute: () => {
          this.spawnProjectileFan(this.phase >= 2 ? 7 : 5, this.phase >= 2 ? 1.1 : 0.8, {
            preset: 'ice_shard', speed: 15, damage: 8,
            effect: { id: StatusEffectIds.SLOWNESS, seconds: 2, level: 1 },
          })
        },
      },
      {
        id: 'frost_nova', cooldown: 11, initialCooldown: 6, windup: 1.4, recovery: 0.8, maxRange: NOVA_RADIUS,
        execute: () => {
          if (this.areaStrike(this.position, NOVA_RADIUS, 11, { knockback: 9, source: 'magic' })) {
            this.applyEffectToPlayer(StatusEffectIds.SLOWNESS, 5, 2)
          }
          if (this.phase >= 2) this.spawnProjectileRing(10, { preset: 'ice_shard', speed: 11, damage: 6 })
        },
      },
      {
        id: 'summon_revenants', cooldown: 24, windup: 1.5, phases: [1, 2], maxRange: 40,
        canUse: () => this.minionCount < 2,
        execute: () => {
          for (const side of [-1, 1]) {
            this.spawnMinion(new IceRevenantEntity({ position: this.findMinionSpot(side) }))
          }
        },
      },
      {
        id: 'ice_armor', cooldown: 22, initialCooldown: 4, windup: 0.8, duration: 6, recovery: 2.5,
        phases: [1, 2], maxRange: 40, allowMovement: true,
        execute: () => { this.armored = true },
        update: (_dt, elapsed) => {
          const due = Math.floor(elapsed / ARMOR_SHARD_INTERVAL)
          if (due > this.armorShards) {
            this.armorShards = due
            this.spawnProjectile({ preset: 'ice_shard', speed: 13, damage: 6, spread: 0.08 })
          }
        },
        onEnd: () => { this.armored = false; this.armorShards = 0 },
      },
    ]
  }

  /**
   * Where a summoned revenant tears out of the ice: beside the Sovereign
   * (side -1 left, 1 right), in the arena, on clear ground (not in a pillar).
   * On uneven floor: the nearest standable cell on rings around the
   * Sovereign, then around the altar; at worst right beside its feet.
   */
  private findMinionSpot(side: number): THREE.Vector3 {
    const rightX = Math.cos(this.facing), rightZ = -Math.sin(this.facing)
    for (const dist of [3, 4.5, 2, 6]) {
      const p = this.clampToArena(new THREE.Vector3(
        this.position.x + rightX * dist * side,
        this.position.y + 0.2,
        this.position.z + rightZ * dist * side
      ))
      if (this.placeOnFloor(p, this.position.y)) return p
    }
    // Rings, starting on this side and alternating outward around it
    const start = Math.atan2(rightX * side, rightZ * side)
    for (const center of [this.position, this.home]) {
      for (const radius of [2, 3.5, 5, 7]) {
        for (let i = 0; i < 12; i++) {
          const angle = start + (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 6)
          const p = this.clampToArena(new THREE.Vector3(
            center.x + Math.sin(angle) * radius, center.y + 0.2, center.z + Math.cos(angle) * radius
          ))
          if (this.placeOnFloor(p, center.y)) return p
        }
      }
    }
    return new THREE.Vector3(this.position.x + rightX * 0.9 * side, this.position.y + 0.2, this.position.z + rightZ * 0.9 * side)
  }

  /** Stand `p` on a floor within 2 blocks of `fromY` (clear feet and head, solid below); false if none. */
  private placeOnFloor(p: THREE.Vector3, fromY: number): boolean {
    const x = Math.floor(p.x), z = Math.floor(p.z), base = Math.floor(fromY)
    for (const dy of [0, 1, -1, 2, -2]) {
      const y = base + dy
      if (!this.isSolidAt(x, y, z) && !this.isSolidAt(x, y + 1, z) && this.isSolidAt(x, y - 1, z)) {
        if (dy !== 0) p.y = y + 0.2
        return true
      }
    }
    return false
  }

  protected onPhaseChanged(phase: number): void {
    if (phase > 0) this.applyEffectToPlayer(StatusEffectIds.SLOWNESS, 3, 1)
  }

  protected updateAnimations(deltaTime: number): void {
    const m = this.model
    if (!m) return
    this.animTime += deltaTime
    const stage = this.attackStage
    const p = this.attackStageProgress
    const id = this.activeAttackId

    // Walk / idle
    const walk = this.isWalking ? Math.sin(this.animTime * 4) * 0.4 : 0
    m.leftLeg.rotation.x = walk
    m.rightLeg.rotation.x = -walk
    m.cape.rotation.x = 0.08 + Math.sin(this.animTime * 1.7) * 0.05 + (this.isWalking ? 0.12 : 0)
    let rArm = -0.2 + walk * -0.3
    let lArm = walk * 0.3
    let lean = 0
    let glow = 0.7 + 0.3 * Math.sin(this.animTime * 2.5)

    if (id === 'glacial_cleave') {
      if (stage === 'windup') { rArm = -2.6 * p; lean = -0.15 * p }
      else if (stage === 'active' || stage === 'recovery') { rArm = 0.5; lean = 0.25 }
    } else if (id === 'shard_volley') {
      if (stage === 'windup') { rArm = -1.6 * p; glow = 1 + p }
      else { rArm = -1.2 }
    } else if (id === 'frost_nova') {
      if (stage === 'windup') { lArm = -2.8 * p; rArm = -2.8 * p; glow = 1 + p }
      else if (stage === 'active') { lArm = 0.4; rArm = 0.4; lean = 0.3 }
    } else if (id === 'summon_revenants' && stage === 'windup') {
      lArm = -1.4; rArm = -1.4; lean = -0.2; glow = 1.5
    }
    m.rightArm.rotation.x = rArm
    m.leftArm.rotation.x = lArm
    m.upper.rotation.x = lean

    // Frost nova telegraph: a ring growing out to the nova radius
    const novaWindup = id === 'frost_nova' && stage === 'windup'
    m.novaRing.visible = novaWindup || (id === 'frost_nova' && stage === 'active')
    if (m.novaRing.visible) {
      const r = novaWindup ? NOVA_RADIUS * (0.25 + 0.75 * p) : NOVA_RADIUS
      m.novaRing.scale.set(r, 1, r)
      m.novaMaterial.opacity = novaWindup ? 0.35 + 0.4 * p : 0.85
    }

    // Ice armour shell
    m.iceArmor.visible = this.armored || (id === 'ice_armor' && stage === 'windup')
    m.armorMaterial.opacity = this.armored ? 0.55 : 0.25 * p

    // Glowing crystals flare with telegraphs
    const v = Math.min(1, glow)
    for (const g of m.glowMaterials) g.color.setRGB(0.55 + 0.45 * v, 0.9 + 0.1 * v, 1)
  }

  dispose(): void {
    this.model = null
    super.dispose()
  }
}
