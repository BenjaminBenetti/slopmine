import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IBlock } from '../../../interfaces/IBlock.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import lavaTexUrl from './assets/lava.webp'

// Register texture for atlas (marked as transparent)
registerTextureUrl(TextureId.LAVA_EIGHTH, lavaTexUrl, true)

const lavaTexture = loadBlockTexture(lavaTexUrl)

/**
 * Create geometry for 1/8 height lava with corrected UVs.
 * Side faces show bottom 1/8 of texture to avoid stretching.
 */
function createLavaEighthGeometry(): THREE.BufferGeometry {
  const height = 0.125
  const yOffset = -0.4375 // Centers the block so bottom is at -0.5

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

const lavaEighthGeometry = createLavaEighthGeometry()

/**
 * Semi-transparent orange material for evaporating lava with texture.
 */
const lavaEighthMaterial = new THREE.MeshLambertMaterial({
  map: lavaTexture,
  transparent: true,
  opacity: 0.5,
  side: THREE.DoubleSide,
  emissive: new THREE.Color(0xff4400),
  emissiveIntensity: 0.05,
})

/**
 * Lava eighth block - a transparent, non-solid liquid at 1/8 height.
 * The thinnest lava level, used when lava is nearly evaporated.
 */
export class LavaEighthBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.LAVA_EIGHTH,
    name: 'lava_eighth',
    isOpaque: false,
    isSolid: false,
    isLiquid: true,
    hardness: 100,
    lightLevel: 8,
    lightBlocking: 0,
    demolitionForceRequired: Infinity,
    tags: [],
    liquidFamily: 'lava',
    liquidLevel: 1,
  }

  protected get defaultTextureId(): number {
    return TextureId.LAVA_EIGHTH
  }

  protected getGeometry(): THREE.BufferGeometry {
    return lavaEighthGeometry
  }

  protected getMaterials(): THREE.Material {
    return lavaEighthMaterial
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
