import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IBlock } from '../../../interfaces/IBlock.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'

/**
 * Semi-transparent blue material for water.
 * Uses depthWrite: false for proper transparent rendering.
 */
const waterMaterial = new THREE.MeshLambertMaterial({
  color: 0x3399ff,
  transparent: true,
  opacity: 0.65,
  side: THREE.DoubleSide,
  depthWrite: false,
})

/**
 * Water block - a transparent, non-solid liquid.
 * Water fills terrain depressions during world generation.
 */
export class WaterBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.WATER,
    name: 'water',
    isOpaque: false,
    isSolid: false,
    isLiquid: true,
    hardness: 100,
    lightLevel: 0,
    lightBlocking: 2,
    demolitionForceRequired: Infinity,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.WATER
  }

  protected getMaterials(): THREE.Material {
    return waterMaterial
  }

  /**
   * Water cannot be greedy-meshed due to transparency.
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
   * Don't render faces between adjacent water blocks.
   */
  override shouldRenderFace(_face: BlockFace, neighbor: IBlock): boolean {
    // Always render face if neighbor is air
    if (neighbor.properties.id === BlockIds.AIR) {
      return true
    }
    // Don't render faces between water blocks
    if (neighbor.properties.id === BlockIds.WATER) {
      return false
    }
    // Render face against any other block
    return true
  }
}
