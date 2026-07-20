import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { PERSISTENT_PLACED_METADATA_BIT } from '../../BlockFacing.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { ResinTapBlockItem } from '../../../../items/blocks/resin_tap/ResinTapBlockItem.ts'
import { PineResinItem } from '../../../../items/materials/pine_resin/PineResinItem.ts'
import resinTapTexUrl from './assets/resin-tap.webp'

// Register texture for atlas (icon generation / any future greedy use)
registerTextureUrl(TextureId.RESIN_TAP, resinTapTexUrl)

const resinTapTexture = loadBlockTexture(resinTapTexUrl)
const resinTapMaterial = new THREE.MeshLambertMaterial({ map: resinTapTexture })

/**
 * Seconds between resin ticks. Each tick adds one fill level (0..3), so a
 * fresh tap fills in ~90-135s of jittered ticks.
 */
export const RESIN_TAP_TICK_INTERVAL = 30

/** Fill level lives in metadata bits 0-2 (values 0..3 used). */
const FILL_METADATA_MASK = 0b111

/** Maximum resin fill level (metadata bits 0-2 value; 3 = full). */
export const MAX_RESIN_FILL = 3

/** Read the resin fill level (0..MAX_RESIN_FILL) from block metadata. */
export function getResinFill(metadata: number): number {
  return Math.min(metadata & FILL_METADATA_MASK, MAX_RESIN_FILL)
}

/** Write a resin fill level into block metadata, preserving all other bits. */
export function setResinFill(metadata: number, fill: number): number {
  return (metadata & ~FILL_METADATA_MASK) | (fill & FILL_METADATA_MASK)
}

/**
 * Tap geometry: a small pail hugging the trunk face.
 *
 * IMPORTANT: this geometry MUST stay symmetric under x-rotation of PI and
 * y-rotation of PI (i.e., an origin-centered axis-aligned box). The fill
 * level is stored in metadata bits 0-2, which the instanced renderer
 * (ChunkMesh) also interprets as a facing rotation - fill 1/2/3 render as
 * DOWN/NORTH/SOUTH rotations. With a centered symmetric box those rotations
 * are visually no-ops, so the reuse of the facing bits is invisible.
 * Do not translate the box off-center or merge in asymmetric parts.
 */
const resinTapGeometry = new THREE.BoxGeometry(0.4, 0.5, 0.4)

/**
 * A tap pail hung on a living pine trunk. While at least one of its 6
 * neighbors is a PINE_LOG it slowly fills with resin via scheduled ticks
 * (one fill level per ~30s tick, up to 3). Press E to collect the stored
 * resin (wired through blockActionRegistry -> collectResin). If the
 * sustaining pine log disappears, the next tick pops the tap off, scattering
 * its drops.
 *
 * Design decision: placement AND ticking both require a PINE_LOG neighbor
 * (not oak/redwood) - taps only work on pine, and allowing placement on
 * other logs would just self-break 30s later, which reads as a bug.
 *
 * Fill state: metadata bits 0-2 (0 = empty .. 3 = full), bit 7
 * (PERSISTENT_PLACED_METADATA_BIT) is stamped on place per the
 * player-placed-block convention and preserved by all fill updates.
 */
export class ResinTapBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.RESIN_TAP,
    name: 'resin_tap',
    isOpaque: false,
    isSolid: false, // No collision - players walk through the cell
    isLiquid: false,
    hardness: 0.5,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
    tickInterval: RESIN_TAP_TICK_INTERVAL,
  }

  protected get defaultTextureId(): number {
    return TextureId.RESIN_TAP
  }

  protected getGeometry(): THREE.BufferGeometry {
    return resinTapGeometry
  }

  protected getMaterials(): THREE.Material {
    return resinTapMaterial
  }

  isGreedyMeshable(): boolean {
    // Custom small-box geometry - rendered via InstancedMesh
    return false
  }

  shouldRenderFace(): boolean {
    // Always render (small non-cube shape, never occluded by neighbors)
    return true
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  /**
   * Targetable via a box matching the pail (geometry is an origin-centered
   * 0.4 x 0.5 x 0.4 box, i.e. the middle of the cell in local [0,1] space).
   */
  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.3, 0.25, 0.3),
      new THREE.Vector3(0.7, 0.75, 0.7)
    )
  }

  /** Taps must hang on a living pine log (any of the 6 face neighbors). */
  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    return hasAdjacentPineLog(world, x, y, z)
  }

  /**
   * Normalize metadata on placement: clear the facing bits BlockPlacement
   * stamped (bits 0-2 are our fill counter, starting empty) and mark the
   * block player-placed (bit 7 convention).
   */
  onPlace(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    world.setBlockMetadata?.(x, y, z, PERSISTENT_PLACED_METADATA_BIT)
  }

  /**
   * Resin accumulation tick.
   * - No adjacent pine log: pop off (scatter drops + stored resin), dormant.
   * - fill < 3: add one level, keep ticking.
   * - fill == 3: dormant until collection re-schedules us.
   */
  onScheduledTick(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const metadata = world.getMetadata?.(x, y, z) ?? 0
    const fill = getResinFill(metadata)

    if (!hasAdjacentPineLog(world, x, y, z)) {
      // Supporting pine is gone - self-break, scattering the tap and any
      // resin it held.
      const drops = this.getDrops()
      for (let i = 0; i < fill; i++) {
        drops.push(new PineResinItem())
      }
      world.setBlock(x, y, z, BlockIds.AIR)
      world.spawnBlockDrops?.(x, y, z, drops)
      return false
    }

    if (fill < MAX_RESIN_FILL) {
      world.setBlockMetadata?.(x, y, z, setResinFill(metadata, fill + 1))
      return true
    }

    return false
  }

  /**
   * Scatter any stored resin when the player breaks the tap. Runs before the
   * block is replaced with air, so metadata is still readable. The tap item
   * itself goes to the player via getDrops.
   */
  onBreak(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const fill = getResinFill(world.getMetadata?.(x, y, z) ?? 0)
    if (fill <= 0) return

    const resin: IItem[] = []
    for (let i = 0; i < fill; i++) {
      resin.push(new PineResinItem())
    }
    world.spawnBlockDrops?.(x, y, z, resin)
  }

  getDrops(): IItem[] {
    return [new ResinTapBlockItem()]
  }
}

/** True if any of the 6 face neighbors of (x, y, z) is a pine log. */
function hasAdjacentPineLog(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
  const getId = (bx: bigint, by: bigint, bz: bigint): number =>
    world.getBlockId ? world.getBlockId(bx, by, bz) : world.getBlock(bx, by, bz).properties.id

  return (
    getId(x + 1n, y, z) === BlockIds.PINE_LOG ||
    getId(x - 1n, y, z) === BlockIds.PINE_LOG ||
    getId(x, y + 1n, z) === BlockIds.PINE_LOG ||
    getId(x, y - 1n, z) === BlockIds.PINE_LOG ||
    getId(x, y, z + 1n) === BlockIds.PINE_LOG ||
    getId(x, y, z - 1n) === BlockIds.PINE_LOG
  )
}

/**
 * Collect the resin stored in the tap at (x, y, z): zeroes the fill bits
 * (preserving bit 7 and everything else) and scatters `fill` pine resin
 * items as dropped item entities.
 *
 * Called from the blockActionRegistry E-handler in main.ts. The caller MUST
 * re-schedule the tap's tick after a successful collection
 * (`worldManager.scheduledBlockTicks.scheduleIfTickable(x, y, z)`) so a full,
 * dormant tap resumes filling.
 *
 * @returns The number of resin items collected (0 if the tap was empty).
 */
export function collectResin(world: IWorld, x: bigint, y: bigint, z: bigint): number {
  const metadata = world.getMetadata?.(x, y, z) ?? 0
  const fill = getResinFill(metadata)
  if (fill <= 0) return 0

  world.setBlockMetadata?.(x, y, z, setResinFill(metadata, 0))

  const resin: IItem[] = []
  for (let i = 0; i < fill; i++) {
    resin.push(new PineResinItem())
  }
  world.spawnBlockDrops?.(x, y, z, resin)

  return fill
}
