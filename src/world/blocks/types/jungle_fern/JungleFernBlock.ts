import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { JungleFernBlockItem } from '../../../../items/blocks/jungle_fern/JungleFernBlockItem.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import jungleFernTexUrl from './assets/jungle-fern.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.JUNGLE_FERN, jungleFernTexUrl, true)

const jungleFernTexture = loadBlockTexture(jungleFernTexUrl)

/**
 * Create cross geometry for ground cover fern blocks.
 * Two diagonal planes intersecting in the center, forming an X when viewed from above.
 * Uses single-sided faces with DoubleSide material to avoid z-fighting.
 * @param height Height of the plant in blocks
 * @param width Width of the plant in blocks (corner to corner diagonal)
 */
function createFernCrossGeometry(height: number = 0.4, width: number = 0.9): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()

  const w = width * 0.5 // Half-width from center
  const bottom = -0.55 // Slightly below block bottom to compensate for texture padding
  const top = bottom + height

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

// Low spreading ground cover fern - 0.4 blocks tall, 0.9 blocks wide
const crossGeometry = createFernCrossGeometry(0.4, 0.9)

const jungleFernMaterial = new THREE.MeshLambertMaterial({
  map: jungleFernTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

export class JungleFernBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.JUNGLE_FERN,
    name: 'jungle_fern',
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
    return TextureId.JUNGLE_FERN
  }

  protected getGeometry(): THREE.BufferGeometry {
    return crossGeometry
  }

  protected getMaterials(): THREE.Material {
    return jungleFernMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getDrops(): IItem[] {
    return [new JungleFernBlockItem()]
  }
}
