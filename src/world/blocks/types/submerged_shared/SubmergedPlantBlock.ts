import * as THREE from 'three'
import type { BlockFace, IBlock, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { playBlockSound } from '../../../../audio/SoundHooks.ts'
import { getLiquidSourceBlockId, getVacatedBlockId } from '../../../liquid/LiquidRegistry.ts'

/**
 * Seconds between support checks (declare as `tickInterval`): a strand whose
 * base was cut floats loose a segment at a time, over about a second.
 */
export const SUBMERGED_SUPPORT_TICK_INTERVAL = 0.12

/**
 * A plant that stands in a liquid (glowkelp, lanternweed): its properties
 * carry `submergedIn`, so its cell renders, lights and sounds as a full
 * source of that liquid, and breaking it leaves the source behind. It is
 * placed only into a source of its liquid, on support (`isSupport`); when the
 * support goes it drifts loose - drops its item, leaves the liquid - and the
 * strand above follows (scheduled ticks cascade up).
 *
 * Subclasses declare `submergedIn` and `tickInterval:
 * SUBMERGED_SUPPORT_TICK_INTERVAL` in their properties.
 */
export abstract class SubmergedPlantBlock extends TransparentBlock {
  abstract getDrops(): IItem[]

  /** Whether the block below holds this plant up (default: anything solid). */
  protected isSupport(below: IBlock): boolean {
    return below.properties.isSolid
  }

  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const family = this.properties.submergedIn
    if (!family) return false
    if (world.getBlock(x, y, z).properties.id !== getLiquidSourceBlockId(family)) return false
    return this.isSupport(world.getBlock(x, y - 1n, z))
  }

  onScheduledTick(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    if (this.isSupport(world.getBlock(x, y - 1n, z))) return false
    playBlockSound(this.properties.id, 'break', { x: Number(x) + 0.5, y: Number(y) + 0.5, z: Number(z) + 0.5 }, { volume: 0.3 })
    world.spawnBlockDrops?.(x, y, z, this.getDrops())
    world.setBlock(x, y, z, getVacatedBlockId(this))
    return false
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }
}
