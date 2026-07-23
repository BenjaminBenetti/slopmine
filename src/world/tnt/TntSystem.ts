import type { WorldManager } from '../WorldManager.ts'
import type { PhysicsBody } from '../../physics/PhysicsBody.ts'
import { BlockIds } from '../blocks/BlockIds.ts'
import { getBlock } from '../blocks/BlockRegistry.ts'

/** Seconds between E-interact ignition and detonation. */
const FUSE_DURATION = 2.0
/** Chain-reaction fuse range (seconds, uniform random). */
const CHAIN_FUSE_MIN = 0.3
const CHAIN_FUSE_MAX = 0.8
/** Interval between fuse smoke puffs (seconds). */
const FUSE_SMOKE_INTERVAL = 0.35

/** Blast radius in blocks (blocks within this distance of the center break). */
const BLAST_RADIUS = 8
/** Damage/knockback reach: full falloff to zero at this distance. */
const DAMAGE_RADIUS = BLAST_RADIUS + 2
/** Player damage at the epicenter (falls off linearly to 0 at DAMAGE_RADIUS). */
const EPICENTER_DAMAGE = 20
/** Knockback speed at the epicenter (blocks/s, falls off with distance). */
const KNOCKBACK_SPEED = 14
/** Extra upward pop so knockback lofts the player off the ground. */
const KNOCKBACK_UPWARD = 6
/** Blocks at or above this hardness shrug off the blast (reinforced blocks). */
const BLAST_PROOF_HARDNESS = 50
/** Fraction of destroyed blocks that scatter their drops. */
const DROP_CHANCE = 0.3

interface PrimedTnt {
  readonly x: number
  readonly y: number
  readonly z: number
  /** Seconds until detonation. */
  timer: number
  /** Seconds until the next fuse smoke puff. */
  smokeTimer: number
}

/**
 * TntSystem - main-thread fuse/explosion driver for TNT blocks.
 *
 * E-interacting with a placed TNT block (wired via blockActionRegistry in
 * main.ts) ignites it: a ~2s fuse with periodic smoke puffs, then a radius-8
 * spherical explosion that
 *   - destroys blocks via world.setBlock (lighting/meshing/neighbors update),
 *     sparing AIR, liquids, obsidian, and anything with hardness >= 50,
 *   - scatters item drops for ~30% of destroyed blocks (same DroppedItemEntity
 *     path tree felling uses, via WorldManager.spawnBlockDrops),
 *   - damages and knocks back the player with linear distance falloff,
 *   - chain-ignites other TNT blocks in the radius on a short random fuse.
 *
 * Every timer expiry re-verifies the block is still TNT (mined mid-fuse or
 * chunk unloaded -> the detonation is cancelled), mirroring GeyserSystem.
 * Visual effects are decoupled via callbacks wired in main.ts.
 */
export class TntSystem {
  private readonly world: WorldManager
  private readonly playerBody: PhysicsBody
  private readonly onPlayerDamaged: (amount: number) => void

  private readonly primed = new Map<string, PrimedTnt>()

  /** Explosion particle burst hook, called with the blast center. */
  private explosionEffect: ((x: number, y: number, z: number) => void) | null = null
  /** Fuse smoke puff hook, called with the block-top position of a primed TNT. */
  private fuseEffect: ((x: number, y: number, z: number) => void) | null = null

  constructor(
    world: WorldManager,
    playerBody: PhysicsBody,
    onPlayerDamaged: (amount: number) => void
  ) {
    this.world = world
    this.playerBody = playerBody
    this.onPlayerDamaged = onPlayerDamaged
  }

  setExplosionEffect(effect: (x: number, y: number, z: number) => void): void {
    this.explosionEffect = effect
  }

  setFuseEffect(effect: (x: number, y: number, z: number) => void): void {
    this.fuseEffect = effect
  }

  /**
   * Ignite the TNT block at the given position.
   * @returns true if a fuse was lit (false: not TNT, or already burning)
   */
  ignite(x: number, y: number, z: number, fuseSeconds: number = FUSE_DURATION): boolean {
    if (this.world.getBlockIdFast(x, y, z) !== BlockIds.TNT) return false

    const key = `${x},${y},${z}`
    if (this.primed.has(key)) return false

    this.primed.set(key, { x, y, z, timer: fuseSeconds, smokeTimer: 0 })
    return true
  }

  update(deltaTime: number): void {
    if (this.primed.size === 0) return

    for (const [key, tnt] of this.primed) {
      tnt.timer -= deltaTime

      // Fuse feedback: periodic smoke puff above the crate
      tnt.smokeTimer -= deltaTime
      if (tnt.smokeTimer <= 0) {
        tnt.smokeTimer = FUSE_SMOKE_INTERVAL
        this.fuseEffect?.(tnt.x + 0.5, tnt.y + 1.1, tnt.z + 0.5)
      }

      if (tnt.timer > 0) continue
      this.primed.delete(key)

      // Mined mid-fuse (drops stay in the player's hands) or chunk unloaded
      if (this.world.getBlockIdFast(tnt.x, tnt.y, tnt.z) !== BlockIds.TNT) continue

      this.explode(tnt.x, tnt.y, tnt.z)
    }
  }

  // --- Explosion --------------------------------------------------------

  private explode(x: number, y: number, z: number): void {
    // Remove the exploding TNT itself first (never drops)
    this.world.setBlock(BigInt(x), BigInt(y), BigInt(z), BlockIds.AIR)

    const centerX = x + 0.5
    const centerY = y + 0.5
    const centerZ = z + 0.5

    this.explosionEffect?.(centerX, centerY, centerZ)
    this.destroyBlocks(x, y, z)
    this.damagePlayer(centerX, centerY, centerZ)
  }

  private destroyBlocks(x: number, y: number, z: number): void {
    const r = BLAST_RADIUS
    const rSq = r * r

    for (let dy = -r; dy <= r; dy++) {
      const by = y + dy
      if (by < 0) continue
      for (let dz = -r; dz <= r; dz++) {
        const bz = z + dz
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy + dz * dz > rSq) continue
          const bx = x + dx

          const blockId = this.world.getBlockIdFast(bx, by, bz)
          if (blockId === BlockIds.AIR) continue

          // Other TNT chain-ignites on a short random fuse instead of breaking
          if (blockId === BlockIds.TNT) {
            this.ignite(bx, by, bz, CHAIN_FUSE_MIN + Math.random() * (CHAIN_FUSE_MAX - CHAIN_FUSE_MIN))
            continue
          }

          const block = getBlock(blockId)
          // Leave liquids alone (no weird holes in water/lava bodies)
          if (block.properties.isLiquid) continue
          // Blast-proof blocks: obsidian and anything comparably hard
          if (blockId === BlockIds.OBSIDIAN) continue
          if (block.properties.hardness >= BLAST_PROOF_HARDNESS) continue

          this.world.setBlock(BigInt(bx), BigInt(by), BigInt(bz), BlockIds.AIR)

          if (Math.random() < DROP_CHANCE) {
            const drops = block.getDrops?.() ?? []
            if (drops.length > 0) {
              this.world.spawnBlockDrops(BigInt(bx), BigInt(by), BigInt(bz), drops)
            }
          }
        }
      }
    }
  }

  private damagePlayer(centerX: number, centerY: number, centerZ: number): void {
    const pos = this.playerBody.position
    // Player mid-body, roughly chest height
    const dx = pos.x - centerX
    const dy = pos.y + 0.9 - centerY
    const dz = pos.z - centerZ
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (dist >= DAMAGE_RADIUS) return

    const falloff = 1 - dist / DAMAGE_RADIUS
    const damage = Math.round(EPICENTER_DAMAGE * falloff)
    if (damage > 0) {
      this.onPlayerDamaged(damage)
    }

    // Knockback: impulse away from the blast (straight up if on top of it)
    const speed = KNOCKBACK_SPEED * falloff
    const velocity = this.playerBody.velocity
    if (dist > 0.01) {
      velocity.x += (dx / dist) * speed
      velocity.y += (dy / dist) * speed + KNOCKBACK_UPWARD * falloff
      velocity.z += (dz / dist) * speed
    } else {
      velocity.y += speed + KNOCKBACK_UPWARD
    }
  }
}
