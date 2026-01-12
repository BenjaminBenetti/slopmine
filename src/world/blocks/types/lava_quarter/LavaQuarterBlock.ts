import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IBlock } from '../../../interfaces/IBlock.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import lavaTexUrl from './assets/lava.webp'

// Register texture for atlas (marked as transparent)
registerTextureUrl(TextureId.LAVA_QUARTER, lavaTexUrl, true)

const lavaTexture = loadBlockTexture(lavaTexUrl)

/**
 * Create geometry for 1/4 height lava with corrected UVs.
 * Side faces show bottom 1/4 of texture to avoid stretching.
 */
function createLavaQuarterGeometry(): THREE.BufferGeometry {
  const height = 0.25
  const yOffset = -0.375 // Centers the block so bottom is at -0.5

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

const lavaQuarterGeometry = createLavaQuarterGeometry()

/**
 * Semi-transparent orange material for partial lava with texture.
 */
const lavaQuarterMaterial = new THREE.MeshLambertMaterial({
  map: lavaTexture,
  transparent: true,
  opacity: 0.65,
  side: THREE.DoubleSide,
  emissive: new THREE.Color(0xff4400),
  emissiveIntensity: 0.1,
})

/**
 * Lava quarter block - a transparent, non-solid liquid at 1/4 height.
 * Used in the liquid physics system for volume equalization.
 */
export class LavaQuarterBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.LAVA_QUARTER,
    name: 'lava_quarter',
    isOpaque: false,
    isSolid: false,
    isLiquid: true,
    hardness: 100,
    lightLevel: 10,
    lightBlocking: 0,
    demolitionForceRequired: Infinity,
    tags: [],
    liquidFamily: 'lava',
    liquidLevel: 2,
  }

  protected get defaultTextureId(): number {
    return TextureId.LAVA_QUARTER
  }

  protected getGeometry(): THREE.BufferGeometry {
    return lavaQuarterGeometry
  }

  protected getMaterials(): THREE.Material {
    return lavaQuarterMaterial
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
