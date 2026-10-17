import * as THREE from 'three'
import type { IItem } from '../items/Item.ts'
import type { IWorld } from '../world/interfaces/IBlock.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import { getBlock } from '../world/blocks/BlockRegistry.ts'
import { setMetadataFacing, yawToFacing } from '../world/blocks/BlockFacing.ts'
import { BlockStateManager } from '../world/blockstate/BlockStateManager.ts'
import type { ChestBlockState } from '../world/blocks/types/chest/ChestBlockState.ts'
import { FloatingTextManager } from '../ui/floating-text/FloatingTextManager.ts'
import { ExplosionParticleManager } from '../renderer/particles/ExplosionParticleManager.ts'

/** World access for the reward chest (WorldManager satisfies it). */
export interface RewardChestWorld extends IWorld {
  getBlockIdFast(x: number, y: number, z: number): number
  /** Is the sub-chunk holding this block loaded? */
  isBlockLoaded(x: number, y: number, z: number): boolean
}

interface Cell {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** Horizontal offsets around the altar, nearest ring first. */
const RINGS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
  [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]],
]
/** Heights tried beside the altar, relative to it: level with its top first (altar in the floor), then a pedestal's floor. */
const SIDE_LEVELS = [1, 0, 2, -1]

const PLAYER_HALF_WIDTH = 0.3
const PLAYER_HEIGHT = 1.8

/**
 * The cell for a guardian's reward chest: on top of the altar (where the
 * guardian stood), else the nearest air cell beside it with solid support.
 * Only loaded cells, never inside the player. Null when there is none.
 */
export function findRewardChestCell(world: RewardChestWorld, altar: Cell, player: THREE.Vector3): Cell | null {
  const fits = (x: number, y: number, z: number): boolean =>
    world.isBlockLoaded(x, y, z) &&
    world.isBlockLoaded(x, y - 1, z) &&
    world.getBlockIdFast(x, y, z) === BlockIds.AIR &&
    getBlock(world.getBlockIdFast(x, y - 1, z)).properties.isSolid &&
    !(
      player.x + PLAYER_HALF_WIDTH > x && player.x - PLAYER_HALF_WIDTH < x + 1 &&
      player.z + PLAYER_HALF_WIDTH > z && player.z - PLAYER_HALF_WIDTH < z + 1 &&
      player.y + PLAYER_HEIGHT > y && player.y < y + 1
    )

  if (fits(altar.x, altar.y + 1, altar.z)) return { x: altar.x, y: altar.y + 1, z: altar.z }
  for (const ring of RINGS) {
    for (const dy of SIDE_LEVELS) {
      for (const [dx, dz] of ring) {
        const x = altar.x + dx, y = altar.y + dy, z = altar.z + dz
        if (fits(x, y, z)) return { x, y, z }
      }
    }
  }
  return null
}

/**
 * Put a defeated guardian's loot in a chest by its altar, placed exactly
 * like a player's chest (setBlock + ChestBlock.onPlace: a registered
 * ChestBlockState, and the loot-resolved metadata bit so no loot table ever
 * rolls into it), so chest and contents persist like any player chest.
 * Faces the player. Returns the items that did not fit (normally none), or
 * null when no chest could be placed (the caller spills the loot).
 */
export function placeRewardChest(world: RewardChestWorld, altar: Cell, items: IItem[], player: THREE.Vector3): IItem[] | null {
  const cell = findRewardChestCell(world, altar, player)
  if (!cell) return null
  const { x, y, z } = cell
  const bx = BigInt(x), by = BigInt(y), bz = BigInt(z)

  const chest = getBlock(BlockIds.CHEST)
  const facing = yawToFacing(Math.atan2(-(x + 0.5 - player.x), -(z + 0.5 - player.z)))
  if (!world.setBlock(bx, by, bz, BlockIds.CHEST, setMetadataFacing(0, facing))) return null
  chest.onPlace?.(world, bx, by, bz, facing)
  const state = BlockStateManager.getInstance().getState<ChestBlockState>({ x: bx, y: by, z: bz })
  if (!state) return null

  // Merge the loot into stacks
  const leftover: IItem[] = []
  let slot = 0
  for (const item of items) {
    let merged = false
    for (let i = 0; i < slot && !merged; i++) {
      const stack = state.getStack(i)
      if (stack && stack.item.id === item.id && stack.count < stack.item.maxStackSize) {
        stack.count++
        merged = true
      }
    }
    if (merged) continue
    if (slot < state.getSlotCount()) state.setStack(slot++, { item, count: 1 })
    else leftover.push(item)
  }

  // Flourish: a puff where the reliquary appears, and a line above it
  ExplosionParticleManager.instance.spawnFuseSmoke(x + 0.5, y + 0.6, z + 0.5)
  try {
    FloatingTextManager.instance.spawn({
      text: 'The sigil rests in the reliquary',
      position: new THREE.Vector3(x + 0.5, y + 1.8, z + 0.5),
      mode: 'floating',
      duration: 4,
      floatSpeed: 0.25,
    })
  } catch {
    // floating text not initialized (headless): the chest is what matters
  }
  return leftover
}
