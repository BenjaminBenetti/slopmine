import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IBlock } from '../../../interfaces/IBlock.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { withWhiteVertexColors } from '../../../../renderer/LiquidMaterials.ts'
import { waterTexUrl, waterMaterial } from '../water/waterMaterial.ts'

// Register texture
registerTextureUrl(TextureId.WATER_THREE_EIGHTH, waterTexUrl)

/**
 * Create geometry for 3/8 height water with corrected UVs.
 * Side faces show bottom 3/8 of texture to avoid stretching.
 */
function createWaterThreeEighthGeometry(): THREE.BufferGeometry {
  const height = 0.375
  const yOffset = -0.3125 // Centers the block so bottom is at -0.5

  const geometry = new THREE.BoxGeometry(1, height, 1)
  geometry.translate(0, yOffset, 0)

  // Fix UVs for side faces - show bottom 3/8 of texture (V: 0 to 0.375)
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
    // Scale V from 0-1 to 0-0.375 (bottom 3/8 of texture)
    uvArray[vIdx] = uvArray[vIdx] * height
  }

  uvAttr.needsUpdate = true
  return geometry
}

const waterThreeEighthGeometry = withWhiteVertexColors(createWaterThreeEighthGeometry())

/**
 * Water three-eighth block - a transparent, non-solid liquid at 3/8 height.
 * Used in the liquid physics system for smooth volume distribution.
 */
export class WaterThreeEighthBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.WATER_THREE_EIGHTH,
    name: 'water_three_eighth',
    isOpaque: false,
    isSolid: false,
    isLiquid: true,
    hardness: 100,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: Infinity,
    tags: [],
    liquidFamily: 'water',
    liquidLevel: 3,
  }

  protected get defaultTextureId(): number {
    return TextureId.WATER_THREE_EIGHTH
  }

  protected getGeometry(): THREE.BufferGeometry {
    return waterThreeEighthGeometry
  }

  protected getMaterials(): THREE.Material {
    return waterMaterial
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
