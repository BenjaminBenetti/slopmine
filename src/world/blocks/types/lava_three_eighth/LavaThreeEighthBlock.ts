import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IBlock } from '../../../interfaces/IBlock.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import lavaTexUrl from './assets/lava.webp'

// Register texture for atlas (marked as transparent)
registerTextureUrl(TextureId.LAVA_THREE_EIGHTH, lavaTexUrl, true)

const lavaTexture = loadBlockTexture(lavaTexUrl)

/**
 * Create geometry for 3/8 height lava with corrected UVs.
 * Side faces show bottom 3/8 of texture to avoid stretching.
 */
function createLavaThreeEighthGeometry(): THREE.BufferGeometry {
  const height = 0.375
  const yOffset = -0.3125 // Centers the block so bottom is at -0.5

  const geometry = new THREE.BoxGeometry(1, height, 1)
  geometry.translate(0, yOffset, 0)

  // Fix UVs for side faces
  const uvAttr = geometry.getAttribute('uv')
  const uvArray = uvAttr.array as Float32Array

  const sideFaceIndices = [
    0, 1, 2, 3,     // +X face vertices
    4, 5, 6, 7,     // -X face vertices
    16, 17, 18, 19, // +Z face vertices
    20, 21, 22, 23, // -Z face vertices
  ]

  for (const vertIdx of sideFaceIndices) {
    const vIdx = vertIdx * 2 + 1
    uvArray[vIdx] = uvArray[vIdx] * height
  }

  uvAttr.needsUpdate = true
  return geometry
}

const lavaThreeEighthGeometry = createLavaThreeEighthGeometry()

/**
 * Semi-transparent orange material for partial lava with texture.
 */
const lavaThreeEighthMaterial = new THREE.MeshLambertMaterial({
  map: lavaTexture,
  transparent: true,
  opacity: 0.7,
  side: THREE.DoubleSide,
  emissive: new THREE.Color(0xff4400),
  emissiveIntensity: 0.15,
})

/**
 * Lava three-eighth block - a transparent, non-solid liquid at 3/8 height.
 * Used in the liquid physics system for volume equalization.
 */
export class LavaThreeEighthBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.LAVA_THREE_EIGHTH,
    name: 'lava_three_eighth',
    isOpaque: false,
    isSolid: false,
    isLiquid: true,
    hardness: 100,
    lightLevel: 11,
    lightBlocking: 0,
    demolitionForceRequired: Infinity,
    tags: [],
    liquidFamily: 'lava',
    liquidLevel: 3,
  }

  protected get defaultTextureId(): number {
    return TextureId.LAVA_THREE_EIGHTH
  }

  protected getGeometry(): THREE.BufferGeometry {
    return lavaThreeEighthGeometry
  }

  protected getMaterials(): THREE.Material {
    return lavaThreeEighthMaterial
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  override shouldRenderFace(_face: BlockFace, neighbor: IBlock): boolean {
    if (neighbor.properties.id === BlockIds.AIR) {
      return true
    }
    if (neighbor.properties.isLiquid) {
      return false
    }
    return true
  }
}
