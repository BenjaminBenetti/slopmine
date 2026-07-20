import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { PineconeItem } from '../../../../items/materials/pinecone/PineconeItem.ts'
import pineconeTexUrl from './assets/pinecone.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.PINECONE, pineconeTexUrl, true)

const pineconeTexture = loadBlockTexture(pineconeTexUrl)

/**
 * Small hanging cross (two intersecting vertical quads) tucked under the
 * cell ceiling, like the flower cross billboards but top-anchored — a cube
 * reads as a floating box, a cutout cross reads as an actual pinecone.
 * Block-local Y spans -0.5..0.5; the cross hangs from +0.5 down `height`.
 */
function createHangingCrossGeometry(width: number, height: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const w = width / 2
  const top = 0.5
  const bottom = 0.5 - height
  const vertices = new Float32Array([
    // Plane 1 (spanning X)
    -w, bottom, 0,  w, bottom, 0,  w, top, 0,
    -w, bottom, 0,  w, top, 0,  -w, top, 0,
    // Plane 2 (spanning Z)
    0, bottom, -w,  0, bottom, w,  0, top, w,
    0, bottom, -w,  0, top, w,  0, top, -w,
  ])
  const uvs = new Float32Array([
    0, 0,  1, 0,  1, 1,  0, 0,  1, 1,  0, 1,
    0, 0,  1, 0,  1, 1,  0, 0,  1, 1,  0, 1,
  ])
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.computeVertexNormals()
  return geo
}

const pineconeGeometry = createHangingCrossGeometry(0.45, 0.5)

const pineconeMaterial = new THREE.MeshLambertMaterial({
  map: pineconeTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Seconds between survival checks: a pinecone must hang from a leaf block.
 */
const PINECONE_TICK_INTERVAL = 2.0

/** Leaf blocks a pinecone can hang from. */
const SUSTAINING_LEAF_IDS: ReadonlySet<number> = new Set([
  BlockIds.OAK_LEAVES,
  BlockIds.PINE_NEEDLES,
  BlockIds.REDWOOD_LEAVES,
  BlockIds.SNOWY_PINE_NEEDLES,
])

/**
 * A pinecone hanging beneath a pine canopy. Small custom-geometry block,
 * no collision, targetable so it can be harvested for a PineconeItem.
 *
 * Survival: the scheduled tick checks the cell directly above — if it is no
 * longer a leaf block (canopy decayed or was chopped), the pinecone drops
 * itself and breaks.
 */
export class PineconeBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINECONE,
    name: 'pinecone',
    isOpaque: false,
    isSolid: false, // No collision - players can walk through
    isLiquid: false,
    hardness: 0, // Instant break
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
    tickInterval: PINECONE_TICK_INTERVAL,
  }

  protected get defaultTextureId(): number {
    return TextureId.PINECONE
  }

  protected getGeometry(): THREE.BufferGeometry {
    return pineconeGeometry
  }

  protected getMaterials(): THREE.Material {
    return pineconeMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    // No collision - players can walk through pinecones
    return null
  }

  shouldRenderFace(_face: BlockFace): boolean {
    // Always render (small non-cube shape)
    return true
  }

  isGreedyMeshable(): boolean {
    // Custom geometry - cannot be greedy-meshed
    return false
  }

  /**
   * Get the interaction box for raycasting: a small box hugging the top of
   * the cell, matching the hanging cross geometry (box space is 0..1 here).
   */
  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.275, 0.5, 0.275),
      new THREE.Vector3(0.725, 1.0, 0.725)
    )
  }

  /**
   * Break if the supporting leaf above is gone. Always returns false
   * (dormant): a surviving pinecone is re-queued by the next nearby block
   * change, and a broken one is gone.
   */
  onScheduledTick(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const aboveId = world.getBlockId
      ? world.getBlockId(x, y + 1n, z)
      : world.getBlock(x, y + 1n, z).properties.id

    if (!SUSTAINING_LEAF_IDS.has(aboveId)) {
      world.spawnBlockDrops?.(x, y, z, this.getDrops())
      world.setBlock(x, y, z, BlockIds.AIR)
    }
    return false
  }

  getDrops(): IItem[] {
    return [new PineconeItem()]
  }
}
