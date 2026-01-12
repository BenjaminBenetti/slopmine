import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IBlock } from '../../../interfaces/IBlock.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import lavaTexUrl from './assets/lava.webp'

// Register texture for atlas (marked as transparent)
registerTextureUrl(TextureId.LAVA_HALF, lavaTexUrl, true)

const lavaTexture = loadBlockTexture(lavaTexUrl)

/**
 * Create geometry for 1/2 height lava with corrected UVs.
 * Side faces show bottom half of texture to avoid stretching.
 */
function createLavaHalfGeometry(): THREE.BufferGeometry {
  const height = 0.5
  const yOffset = -0.25 // Centers the block so bottom is at -0.5

  const geometry = new THREE.BoxGeometry(1, height, 1)
  geometry.translate(0, yOffset, 0)

  // Fix UVs for side faces - show bottom half of texture (V: 0 to 0.5)
  const uvAttr = geometry.getAttribute('uv')
  const uvArray = uvAttr.array as Float32Array

  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
  const sideFaceIndices = [
    0, 1, 2, 3,     // +X face vertices
    4, 5, 6, 7,     // -X face vertices
    16, 17, 18, 19, // +Z face vertices
    20, 21, 22, 23, // -Z face vertices
  ]

  for (const vertIdx of sideFaceIndices) {
    const vIdx = vertIdx * 2 + 1 // V component offset
    uvArray[vIdx] = uvArray[vIdx] * height
  }

  uvAttr.needsUpdate = true
  return geometry
}

const lavaHalfGeometry = createLavaHalfGeometry()

/**
 * Semi-transparent orange material for partial lava with texture.
 */
const lavaHalfMaterial = new THREE.MeshLambertMaterial({
  map: lavaTexture,
  transparent: true,
  opacity: 0.75,
  side: THREE.DoubleSide,
  emissive: new THREE.Color(0xff4400),
  emissiveIntensity: 0.2,
})

/**
 * Lava half block - a transparent, non-solid liquid at 1/2 height.
 * Used in the liquid physics system for volume equalization.
 */
export class LavaHalfBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.LAVA_HALF,
    name: 'lava_half',
    isOpaque: false,
    isSolid: false,
    isLiquid: true,
    hardness: 100,
    lightLevel: 12,
    lightBlocking: 0,
    demolitionForceRequired: Infinity,
    tags: [],
    liquidFamily: 'lava',
    liquidLevel: 4,
  }

  protected get defaultTextureId(): number {
    return TextureId.LAVA_HALF
  }

  protected getGeometry(): THREE.BufferGeometry {
    return lavaHalfGeometry
  }

  protected getMaterials(): THREE.Material {
    return lavaHalfMaterial
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
