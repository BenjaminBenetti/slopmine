/**
 * Sounds derived from watching the player each tick rather than from events:
 * footsteps on the block underfoot, jump and landing (the heavy thud only on
 * falls that deal damage), ladder climbing,
 * splashes and swimming, eating/drinking while a consumable is used, the
 * Return Idol channel, hotbar ticks and the respawn chime.
 */

import { BlockRegistry } from '../world/blocks/BlockRegistry.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import { calculateFallDamage } from '../player/FallDamageTracker.ts'
import { getBlockSoundMaterial } from './BlockSoundMaterials.ts'
import type { SoundBank } from './SoundBank.ts'
import type { SoundHandle } from './SoundHooks.ts'

export interface PlayerSoundSources {
  readonly body: {
    readonly position: { x: number; y: number; z: number }
    readonly velocity: { x: number; y: number; z: number }
    readonly isOnGround: boolean
    readonly skipPhysics: boolean
    readonly isClimbing: boolean
  }
  getBlockId(x: number, y: number, z: number): number
  isConsuming(): boolean
  getConsumptionProgress(): number
  getConsumingItemId(): string | null
  /** Tags of the item currently being consumed (the selected hotbar stack). */
  getConsumingItemTags(): ReadonlyArray<string>
  getSelectedHotbarIndex(): number
  isDead(): boolean
}

type ConsumeKind = 'eat' | 'drink' | 'idol' | 'none'

const STRIDE_BASE = 2.2
const EAT_INTERVAL = 0.22
const DRINK_INTERVAL = 0.42

export class PlayerSoundTracker {
  private wasOnGround = true
  private airborneMinVy = 0
  private stride = 0
  private climb = 0
  private liquid: string | null = null
  private swim = 0
  private consume: { itemId: string; kind: ConsumeKind; timer: number; handle: SoundHandle | null; progress: number } | null = null
  private lastConsumedAt = -Infinity
  private lastHotbar = -1
  private wasDead = false
  private clock = 0

  constructor(
    private readonly bank: SoundBank,
    private readonly src: PlayerSoundSources,
  ) {}

  /** The consumed item finished (item-consumed event). */
  markConsumed(): void {
    this.lastConsumedAt = this.clock
  }

  update(dt: number): void {
    this.clock += dt
    this.updateMovement(dt)
    this.updateConsumption(dt)

    const hotbar = this.src.getSelectedHotbarIndex()
    if (this.lastHotbar >= 0 && hotbar !== this.lastHotbar) this.bank.play('ui.hotbar', null)
    this.lastHotbar = hotbar

    const dead = this.src.isDead()
    if (this.wasDead && !dead) this.bank.play('player.respawn', null)
    this.wasDead = dead
  }

  private updateMovement(dt: number): void {
    const body = this.src.body
    const p = body.position
    const v = body.velocity
    if (body.skipPhysics || this.src.isDead()) {
      this.wasOnGround = true
      this.stride = 0
      this.liquid = null
      return
    }

    const liquid = this.liquidAt(p.x, p.y + 0.3, p.z) ?? this.liquidAt(p.x, p.y + 1.0, p.z)
    if (liquid !== this.liquid) {
      if (liquid && !this.liquid) {
        if (liquid === 'lava') this.bank.play('player.lava', null)
        else if (v.y < -7) this.bank.play('player.splash', null)
        else this.bank.play('player.splash.small', null)
      } else if (!liquid && this.liquid && this.liquid !== 'lava' && v.y > 1) {
        this.bank.play('player.splash.small', null, { volume: 0.6 })
      }
      this.liquid = liquid
    }

    const speed = Math.hypot(v.x, v.z)
    const onGround = body.isOnGround

    if (this.liquid && this.liquid !== 'lava') {
      if (speed > 1 || Math.abs(v.y) > 1.5) {
        this.swim += dt
        if (this.swim > 0.85) {
          this.swim = 0
          this.bank.play('player.swim', null)
        }
      }
    } else if (body.isClimbing) {
      this.climb += Math.abs(v.y) * dt
      if (this.climb > 0.7) {
        this.climb = 0
        this.step(p.x, p.y + 0.5, p.z, 0.7)
      }
    } else if (onGround && speed > 0.6) {
      this.stride += speed * dt
      const strideLength = STRIDE_BASE + speed * 0.1
      if (this.stride >= strideLength) {
        this.stride -= strideLength
        this.step(p.x, p.y - 0.2, p.z, Math.max(0.45, Math.min(1, speed / 7)))
      }
    }

    if (!onGround) {
      this.airborneMinVy = Math.min(this.airborneMinVy, v.y)
      if (this.wasOnGround && v.y > 3 && !this.liquid) this.step(p.x, p.y - 0.2, p.z, 0.6)
    } else if (!this.wasOnGround) {
      const impact = -this.airborneMinVy
      if (!this.liquid && impact > 4) {
        this.step(p.x, p.y - 0.2, p.z, Math.min(1.3, 0.55 + impact / 16))
        // The heavy thud only for falls that hurt (slime blocks cushion them)
        const landedOn = this.src.getBlockId(p.x, p.y - 0.2, p.z)
        if (calculateFallDamage(impact) > 0 && landedOn !== BlockIds.SLIME) {
          this.bank.play('player.land', null, { volume: Math.min(1.3, impact / 22) })
        }
        this.stride = 0
      }
      this.airborneMinVy = 0
    }
    if (onGround) this.airborneMinVy = 0
    this.wasOnGround = onGround
  }

  /** Footstep on the block at (x, y, z); probes the corners when standing over an edge. */
  private step(x: number, y: number, z: number, volume: number): void {
    let id = this.src.getBlockId(x, y, z)
    if (!getBlockSoundMaterial(id)) {
      for (const [ox, oz] of [
        [0.3, 0.3],
        [-0.3, 0.3],
        [0.3, -0.3],
        [-0.3, -0.3],
      ]) {
        id = this.src.getBlockId(x + ox, y, z + oz)
        if (getBlockSoundMaterial(id)) break
      }
    }
    const material = getBlockSoundMaterial(id)
    if (material) this.bank.play(`block.${material}.step`, null, { volume })
  }

  private liquidAt(x: number, y: number, z: number): string | null {
    const id = this.src.getBlockId(x, y, z)
    if (id === 0) return null
    const props = BlockRegistry.getInstance().getBlock(id).properties
    return props.isLiquid ? (props.liquidFamily ?? 'water') : props.submergedIn ?? null
  }

  private updateConsumption(dt: number): void {
    const consuming = this.src.isConsuming()
    const itemId = consuming ? this.src.getConsumingItemId() : null
    const current = this.consume

    if (current && current.itemId !== itemId) {
      // Use ended: completed (item-consumed just fired) or cancelled.
      const completed = this.clock - this.lastConsumedAt < 0.3
      if (current.kind === 'idol' && current.handle) {
        current.handle.stop(completed ? 0.6 : 0.25)
        if (!completed && current.progress > 0.3) this.bank.play('idol.fail', null)
      }
      this.consume = null
    }

    if (itemId && !this.consume) {
      const tags = this.src.getConsumingItemTags()
      const kind: ConsumeKind =
        itemId === 'return_idol' ? 'idol' : tags.includes('potion') || tags.includes('drink') ? 'drink' : tags.includes('food') ? 'eat' : 'none'
      this.consume = {
        itemId,
        kind,
        // First bite/sip lands shortly after the button goes down.
        timer: kind === 'eat' ? EAT_INTERVAL - 0.08 : DRINK_INTERVAL - 0.15,
        handle: kind === 'idol' ? this.bank.play('idol.channel', null) : null,
        progress: 0,
      }
    }

    const active = this.consume
    if (!active) return
    active.progress = this.src.getConsumptionProgress()
    if (active.kind === 'eat' || active.kind === 'drink') {
      active.timer += dt
      const interval = active.kind === 'eat' ? EAT_INTERVAL : DRINK_INTERVAL
      if (active.timer >= interval) {
        active.timer = 0
        this.bank.play(active.kind === 'eat' ? 'item.eat' : 'item.drink', null)
      }
    }
  }
}
