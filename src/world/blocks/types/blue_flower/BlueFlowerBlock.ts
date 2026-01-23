import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlueFlowerBlockItem } from '../../../../items/blocks/blue_flower/BlueFlowerBlockItem.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import blueFlowerTexUrl from './assets/blue-flower.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.BLUE_FLOWER, blueFlowerTexUrl, true)

const blueFlowerTexture = loadBlockTexture(blueFlowerTexUrl)

/**
 * Create cross geometry for flower-style blocks.
 * Two diagonal planes intersecting in the center, forming an X when viewed from above.
 * Uses single-sided faces with DoubleSide material to avoid z-fighting.
 * @param height Height of the plant (0.0 to 1.0, where 1.0 = full block)
 * @param width Width factor (0.0 to 1.0, where 1.0 = corner to corner)
 */
function createFlowerCrossGeometry(height: number = 0.6, width: number = 0.7): THREE.BufferGeometry {
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

// 45% height, 50% width - small delicate flowers
const crossGeometry = createFlowerCrossGeometry(0.45, 0.5)

const blueFlowerMaterial = new THREE.MeshLambertMaterial({
  map: blueFlowerTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

export class BlueFlowerBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.BLUE_FLOWER,
    name: 'blue_flower',
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
    return TextureId.BLUE_FLOWER
  }

  protected getGeometry(): THREE.BufferGeometry {
    return crossGeometry
  }

  protected getMaterials(): THREE.Material {
    return blueFlowerMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Get the interaction box for raycasting.
   * Returns a small centered box matching the flower's cross geometry.
   * Uses height=0.45, width=0.5
   */
  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.25, 0, 0.25),
      new THREE.Vector3(0.75, 0.45, 0.75)
    )
  }

  getDrops(): IItem[] {
    return [new BlueFlowerBlockItem()]
  }
}
