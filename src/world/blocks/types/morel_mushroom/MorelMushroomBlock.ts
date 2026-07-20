import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { MorelMushroomBlockItem } from '../../../../items/blocks/morel_mushroom/MorelMushroomBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import morelTexUrl from './assets/morel-mushroom.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.MOREL_MUSHROOM, morelTexUrl, true)

const morelTexture = loadBlockTexture(morelTexUrl)

/**
 * Create cross geometry for the morel: two diagonal planes intersecting in
 * the center, forming an X viewed from above (same billboard style as
 * flowers). Single-sided faces with a DoubleSide material avoid z-fighting.
 * @param height Height of the mushroom (0.0 to 1.0)
 * @param width Width factor (0.0 to 1.0, 1.0 = corner to corner)
 */
function createMorelCrossGeometry(height: number = 0.45, width: number = 0.5): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()

  const w = width * 0.5 // Half-width from center
  const bottom = -0.5   // Bottom of block
  const top = bottom + height // Top based on height

  const vertices = new Float32Array([
    // First plane (diagonal from -X,-Z to +X,+Z)
    -w, bottom, -w,  w, bottom, w,  w, top, w,
    -w, bottom, -w,  w, top, w,  -w, top, -w,
    // Second plane (diagonal from -X,+Z to +X,-Z)
    -w, bottom, w,  w, bottom, -w,  w, top, -w,
    -w, bottom, w,  w, top, -w,  -w, top, w,
  ])

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

// 45% height, 50% width - a small ground mushroom
const morelCrossGeometry = createMorelCrossGeometry(0.45, 0.5)

const morelMaterial = new THREE.MeshLambertMaterial({
  map: morelTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Morel mushroom - a small cross-billboard forage fungus that grows on
 * podzol patches on the pine-forest floor. Break to collect the morel.
 */
export class MorelMushroomBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.MOREL_MUSHROOM,
    name: 'morel_mushroom',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.MOREL_MUSHROOM
  }

  protected getGeometry(): THREE.BufferGeometry {
    return morelCrossGeometry
  }

  protected getMaterials(): THREE.Material {
    return morelMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Get the interaction box for raycasting.
   * Matches the morel's cross geometry (height=0.45, width=0.5).
   */
  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.25, 0, 0.25),
      new THREE.Vector3(0.75, 0.45, 0.75)
    )
  }

  /**
   * A mature morel breaks into a cluster of replantable mushrooms (2-3).
   */
  getDrops(): IItem[] {
    const count = 2 + (Math.random() < 0.5 ? 1 : 0)
    const drops: IItem[] = []
    for (let i = 0; i < count; i++) {
      drops.push(new MorelMushroomBlockItem())
    }
    return drops
  }

  /**
   * Replantable only on forest soil.
   */
  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const below = world.getBlockId
      ? world.getBlockId(x, y - 1n, z)
      : world.getBlock(x, y - 1n, z).properties.id
    return (
      below === BlockIds.GRASS ||
      below === BlockIds.DIRT ||
      below === BlockIds.PODZOL ||
      below === BlockIds.SNOWY_GRASS
    )
  }
}
