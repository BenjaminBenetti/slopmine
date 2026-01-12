import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IBlock } from '../../../interfaces/IBlock.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import lavaTexUrl from './assets/lava.webp'

// Register texture for atlas (marked as transparent)
registerTextureUrl(TextureId.LAVA_SEVEN_EIGHTH, lavaTexUrl, true)

const lavaTexture = loadBlockTexture(lavaTexUrl)

/**
 * Create geometry for 7/8 height lava with corrected UVs.
 * Side faces show bottom 7/8 of texture to avoid stretching.
 */
function createLavaSevenEighthGeometry(): THREE.BufferGeometry {
  const height = 0.875
  const yOffset = -0.0625 // Centers the block so bottom is at -0.5

  const geometry = new THREE.BoxGeometry(1, height, 1)
  geometry.translate(0, yOffset, 0)

  // Fix UVs for side faces - show bottom portion of texture
  const uvAttr = geometry.getAttribute('uv')
  const uvArray = uvAttr.array as Float32Array

  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
  // Each face has 4 vertices, 2 UV components each = 8 floats per face
  // Side faces are: +X (0-7), -X (8-15), +Z (32-39), -Z (40-47)
  const sideFaceIndices = [
    0, 1, 2, 3,     // +X face vertices
    4, 5, 6, 7,     // -X face vertices
    16, 17, 18, 19, // +Z face vertices
    20, 21, 22, 23, // -Z face vertices
  ]

  for (const vertIdx of sideFaceIndices) {
    const vIdx = vertIdx * 2 + 1 // V component offset
    // Scale V from 0-1 to 0-height (bottom portion of texture)
    uvArray[vIdx] = uvArray[vIdx] * height
  }

  uvAttr.needsUpdate = true
  return geometry
}

const lavaSevenEighthGeometry = createLavaSevenEighthGeometry()

/**
 * Semi-transparent orange material for partial lava with texture.
 */
const lavaSevenEighthMaterial = new THREE.MeshLambertMaterial({
  map: lavaTexture,
  transparent: true,
  opacity: 0.9,
  side: THREE.DoubleSide,
  emissive: new THREE.Color(0xff4400),
  emissiveIntensity: 0.3,
})

/**
 * Lava seven-eighth block - a transparent, non-solid liquid at 7/8 height.
 * Used in the liquid physics system for volume equalization.
 */
export class LavaSevenEighthBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.LAVA_SEVEN_EIGHTH,
    name: 'lava_seven_eighth',
    isOpaque: false,
    isSolid: false,
    isLiquid: true,
    hardness: 100,
    lightLevel: 15,
    lightBlocking: 0,
    demolitionForceRequired: Infinity,
    tags: [],
    liquidFamily: 'lava',
    liquidLevel: 7,
  }

  protected get defaultTextureId(): number {
    return TextureId.LAVA_SEVEN_EIGHTH
  }

  protected getGeometry(): THREE.BufferGeometry {
    return lavaSevenEighthGeometry
  }

  protected getMaterials(): THREE.Material {
    return lavaSevenEighthMaterial
  }

  /**
   * Lava cannot be greedy-meshed due to transparency and custom geometry.
   */
  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Lava has no collision - player can walk through it.
   */
  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  /**
   * Only render faces adjacent to air or non-lava blocks.
   * Don't render faces between adjacent lava blocks of any level.
   */
  override shouldRenderFace(_face: BlockFace, neighbor: IBlock): boolean {
    // Always render face if neighbor is air
    if (neighbor.properties.id === BlockIds.AIR) {
      return true
    }
    // Don't render faces between liquid blocks (any level)
    if (neighbor.properties.isLiquid) {
      return false
    }
    // Render face against any other block
    return true
  }
}
