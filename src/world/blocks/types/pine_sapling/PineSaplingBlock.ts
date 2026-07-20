import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { PERSISTENT_PLACED_METADATA_BIT } from '../../BlockFacing.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { PineSaplingBlockItem } from '../../../../items/blocks/pine_sapling/PineSaplingBlockItem.ts'
import {
  buildPineTree,
  hasPineGrowthClearance,
  rollPineTrunkHeight,
} from './PineTreeBuilder.ts'
import pineSaplingTexUrl from './assets/pine-sapling.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.PINE_SAPLING, pineSaplingTexUrl, true)

const pineSaplingTexture = loadBlockTexture(pineSaplingTexUrl)

/**
 * Create cross geometry for the sapling: two diagonal planes intersecting in
 * the center (same construction as the flower blocks), with UVs for the atlas.
 * @param height Height of the plant (0.0 to 1.0, where 1.0 = full block)
 * @param width Width factor (0.0 to 1.0, where 1.0 = corner to corner)
 */
function createSaplingCrossGeometry(height: number, width: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()

  const w = width * 0.5 // Half-width from center
  const bottom = -0.5   // Bottom of block
  const top = bottom + height

  const vertices = new Float32Array([
    // First plane (diagonal from -X,-Z to +X,+Z)
    -w, bottom, -w,  w, bottom, w,  w, top, w,
    -w, bottom, -w,  w, top, w,  -w, top, -w,
    // Second plane (diagonal from -X,+Z to +X,-Z)
    -w, bottom, w,  w, bottom, -w,  w, top, -w,
    -w, bottom, w,  w, top, -w,  -w, top, w,
  ])

  const uvs = new Float32Array([
    0, 0,  1, 0,  1, 1,
    0, 0,  1, 1,  0, 1,
    0, 0,  1, 0,  1, 1,
    0, 0,  1, 1,  0, 1,
  ])

  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.computeVertexNormals()

  return geo
}

// 80% height, 70% width - a young tree, taller than the flowers
const crossGeometry = createSaplingCrossGeometry(0.8, 0.7)

const pineSaplingMaterial = new THREE.MeshLambertMaterial({
  map: pineSaplingTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/** Ground blocks a sapling can be planted on (and survive on). */
const VALID_GROUND_BLOCKS: ReadonlySet<number> = new Set([
  BlockIds.GRASS,
  BlockIds.DIRT,
  BlockIds.PODZOL,
  BlockIds.SNOWY_GRASS,
])

/**
 * Growth stage lives in metadata bits 0-3. Bit 7 is the persistent-placed
 * bit (set by onPlace, as for all player-placed natural blocks) and must be
 * preserved across stage updates. Note that BlockPlacement stamps yaw-derived
 * FACING into bits 0-2 at placement time - onPlace therefore resets metadata
 * to exactly the persistent bit so the stage counter starts at 0.
 */
const GROWTH_STAGE_MASK = 0b0000_1111

/**
 * Scheduled ticks needed before the sapling tries to grow (the tick that
 * reaches this count attempts growth). At ~20s jittered intervals this puts
 * maturity around the 2-minute mark.
 */
const GROWTH_STAGES_TO_MATURE = 5

/** Seconds between growth ticks (jittered 0.75x-1.5x by the scheduler). */
const SAPLING_TICK_INTERVAL = 20

/**
 * A plantable pine sapling. Crafted from a pinecone, planted on grass, dirt,
 * podzol, or snowy grass. Grows into a full pine tree (PineTreeFeature cone
 * shape) after several scheduled ticks, provided the trunk column is clear.
 *
 * The grown tree is placed with metadata 0 (no persistent bit), so it can be
 * felled by chopping the trunk and its canopy decays like a natural tree.
 */
export class PineSaplingBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_SAPLING,
    name: 'pine_sapling',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
    tickInterval: SAPLING_TICK_INTERVAL,
  }

  protected get defaultTextureId(): number {
    return TextureId.PINE_SAPLING
  }

  protected getGeometry(): THREE.BufferGeometry {
    return crossGeometry
  }

  protected getMaterials(): THREE.Material {
    return pineSaplingMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  /** Selection box matching the cross geometry (height 0.8, width 0.7). */
  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.15, 0, 0.15),
      new THREE.Vector3(0.85, 0.8, 0.85)
    )
  }

  /** Saplings can only be planted on grass/dirt/podzol/snowy grass. */
  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const groundId = world.getBlockId
      ? world.getBlockId(x, y - 1n, z)
      : world.getBlock(x, y - 1n, z).properties.id
    return VALID_GROUND_BLOCKS.has(groundId)
  }

  /**
   * Normalize metadata: BlockPlacement wrote yaw facing into bits 0-2, which
   * would otherwise pre-load the growth-stage counter. Reset to exactly the
   * persistent-placed bit (saplings are always player-placed) with stage 0.
   */
  onPlace(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    world.setBlockMetadata?.(x, y, z, PERSISTENT_PLACED_METADATA_BIT)
  }

  /**
   * Growth tick. Self-breaks (dropping the sapling item) if the ground below
   * is no longer valid. Otherwise advances the growth stage; once mature and
   * the trunk column is clear, replaces itself with a full runtime-built pine.
   * @returns true to keep rescheduling (still growing, or growth blocked),
   *   false once grown or broken
   */
  onScheduledTick(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    // Ground was removed or replaced - pop off as an item
    const groundId = world.getBlockId
      ? world.getBlockId(x, y - 1n, z)
      : world.getBlock(x, y - 1n, z).properties.id
    if (!VALID_GROUND_BLOCKS.has(groundId)) {
      world.spawnBlockDrops?.(x, y, z, this.getDrops())
      world.setBlock(x, y, z, BlockIds.AIR, 0)
      return false
    }

    const metadata = world.getMetadata?.(x, y, z) ?? 0
    const stage = metadata & GROWTH_STAGE_MASK

    // Still growing: bump the stage (preserving bit 7) and reschedule
    if (stage + 1 < GROWTH_STAGES_TO_MATURE) {
      world.setBlockMetadata?.(x, y, z, (metadata & ~GROWTH_STAGE_MASK) | (stage + 1))
      return true
    }

    // Mature: grow if the trunk column is clear, otherwise retry later
    const trunkHeight = rollPineTrunkHeight()
    if (!hasPineGrowthClearance(world, x, y, z, trunkHeight)) {
      return true
    }

    buildPineTree(world, x, y, z, trunkHeight)
    return false
  }

  getDrops(): IItem[] {
    return [new PineSaplingBlockItem()]
  }
}
