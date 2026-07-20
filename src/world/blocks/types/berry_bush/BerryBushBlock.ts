import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { PERSISTENT_PLACED_METADATA_BIT } from '../../BlockFacing.ts'
import { BerryBushBlockItem } from '../../../../items/blocks/berry_bush/BerryBushBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import berryBushTexUrl from './assets/berry-bush.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.BERRY_BUSH, berryBushTexUrl, true)

const berryBushTexture = loadBlockTexture(berryBushTexUrl)

/** Seconds between regrowth checks for a picked-clean berry bush. */
export const BERRY_BUSH_REGROW_INTERVAL = 45.0

/** Ground blocks a berry bush can survive on. */
export const BERRY_BUSH_VALID_GROUND: ReadonlySet<number> = new Set([
  BlockIds.GRASS,
  BlockIds.DIRT,
  BlockIds.PODZOL,
  BlockIds.SNOWY_GRASS,
])

/**
 * Create cross geometry for bush-style blocks.
 * Two diagonal planes intersecting in the center, forming an X when viewed
 * from above. Single-sided faces with a DoubleSide material avoid z-fighting.
 * Shared by both berry bush variants so they swap without visual popping.
 * @param height Height of the plant (0.0 to 1.0, where 1.0 = full block)
 * @param width Width factor (0.0 to 1.0, where 1.0 = corner to corner)
 */
export function createBushCrossGeometry(height: number = 0.8, width: number = 0.9): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()

  const w = width * 0.5 // Half-width from center
  const bottom = -0.5   // Bottom of block
  const top = bottom + height // Top based on height

  // Two intersecting diagonal planes (single face each, material handles double-sided)
  const vertices = new Float32Array([
    // First plane (diagonal from -X,-Z to +X,+Z)
    -w, bottom, -w,  w, bottom, w,  w, top, w,
    -w, bottom, -w,  w, top, w,  -w, top, -w,
    // Second plane (diagonal from -X,+Z to +X,-Z)
    -w, bottom, w,  w, bottom, -w,  w, top, -w,
    -w, bottom, w,  w, top, -w,  -w, top, w,
  ])

  // UV coordinates for texture mapping
  const uvs = new Float32Array([
    // First plane
    0, 0,  1, 0,  1, 1,
    0, 0,  1, 1,  0, 1,
    // Second plane
    0, 0,  1, 0,  1, 1,
    0, 0,  1, 1,  0, 1,
  ])

  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.computeVertexNormals()

  return geo
}

// 80% height, 90% width - a full, rounded forest bush
const bushCrossGeometry = createBushCrossGeometry(0.8, 0.9)

const berryBushMaterial = new THREE.MeshLambertMaterial({
  map: berryBushTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Picked-clean berry bush. Regrows berries over time via a scheduled tick:
 * harvesting the laden variant swaps it to this block, and that setBlock
 * change queues the regrow tick automatically (see ScheduledBlockTicks).
 */
export class BerryBushBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.BERRY_BUSH,
    name: 'berry_bush',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.2,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
    tickInterval: BERRY_BUSH_REGROW_INTERVAL,
  }

  protected get defaultTextureId(): number {
    return TextureId.BERRY_BUSH
  }

  protected getGeometry(): THREE.BufferGeometry {
    return bushCrossGeometry
  }

  protected getMaterials(): THREE.Material {
    return berryBushMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Get the interaction box for raycasting.
   * Matches the bush cross geometry (height=0.8, width=0.9).
   */
  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.05, 0, 0.05),
      new THREE.Vector3(0.95, 0.8, 0.95)
    )
  }

  /**
   * Mark player-placed bushes with the persistent bit (same convention as
   * leaves/logs). setBlock preserves metadata when the metadata arg is
   * omitted, so the bit survives every harvest/regrow id swap.
   */
  onPlace(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const metadata = world.getMetadata?.(x, y, z) ?? 0
    world.setBlockMetadata?.(x, y, z, metadata | PERSISTENT_PLACED_METADATA_BIT)
  }

  /**
   * Regrow tick: self-break if the ground below is invalid, otherwise become
   * the laden variant. The setBlock swap omits the metadata arg, so existing
   * metadata (including persistent bit 7) is preserved. Always returns false:
   * the laden bush doesn't tick, and a broken bush is gone.
   */
  onScheduledTick(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const below = world.getBlockId
      ? world.getBlockId(x, y - 1n, z)
      : world.getBlock(x, y - 1n, z).properties.id

    if (!BERRY_BUSH_VALID_GROUND.has(below)) {
      world.setBlock(x, y, z, BlockIds.AIR)
      return false
    }

    world.setBlock(x, y, z, BlockIds.BERRY_BUSH_BERRIES)
    return false
  }

  getDrops(): IItem[] {
    return [new BerryBushBlockItem()]
  }
}
