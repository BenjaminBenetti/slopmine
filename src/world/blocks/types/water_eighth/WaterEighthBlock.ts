import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IBlock } from '../../../interfaces/IBlock.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import waterTexUrl from './assets/water.webp'

// Register texture for atlas (marked as transparent)
registerTextureUrl(TextureId.WATER_EIGHTH, waterTexUrl, true)

const waterTexture = loadBlockTexture(waterTexUrl)

/**
 * Create geometry for 1/8 height water with corrected UVs.
 * Side faces show bottom eighth of texture to avoid stretching.
 */
function createWaterEighthGeometry(): THREE.BufferGeometry {
  const height = 0.125
  const yOffset = -0.4375 // Centers the block so bottom is at -0.5

  const geometry = new THREE.BoxGeometry(1, height, 1)
  geometry.translate(0, yOffset, 0)

  // Fix UVs for side faces - show bottom eighth of texture (V: 0 to 0.125)
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
    // Scale V from 0-1 to 0-0.125 (bottom eighth of texture)
    uvArray[vIdx] = uvArray[vIdx] * height
  }

  uvAttr.needsUpdate = true
  return geometry
}

const waterEighthGeometry = createWaterEighthGeometry()

/**
 * Semi-transparent blue material for evaporating water with texture.
 * Slightly more transparent than quarter water to indicate it's disappearing.
 */
const waterEighthMaterial = new THREE.MeshLambertMaterial({
  map: waterTexture,
  transparent: true,
  opacity: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Water eighth block - a transparent, non-solid liquid at 1/8 height.
 * This is a transitional state before evaporation.
 * Quarter blocks become eighth blocks when not near a half-or-greater source.
 * Eighth blocks evaporate (become air) if still not near a source on the next pass.
 */
export class WaterEighthBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.WATER_EIGHTH,
    name: 'water_eighth',
    isOpaque: false,
    isSolid: false,
    isLiquid: true,
    hardness: 100,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: Infinity,
    tags: [],
    liquidFamily: 'water',
    liquidLevel: 1,
  }

  protected get defaultTextureId(): number {
    return TextureId.WATER_EIGHTH
  }

  protected getGeometry(): THREE.BufferGeometry {
    return waterEighthGeometry
  }

  protected getMaterials(): THREE.Material {
    return waterEighthMaterial
  }

  /**
   * Water cannot be greedy-meshed due to transparency and custom geometry.
   */
  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Water has no collision - player can walk through it.
   */
  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  /**
   * Only render faces adjacent to air or non-water blocks.
   * Don't render faces between adjacent water blocks of any level.
   */
  override shouldRenderFace(_face: BlockFace, neighbor: IBlock): boolean {
    // Always render face if neighbor is air
    if (neighbor.properties.id === BlockIds.AIR) {
      return true
    }
    // Don't render faces between water blocks (any level)
    if (neighbor.properties.isLiquid) {
      return false
    }
    // Render face against any other block
    return true
  }
}
