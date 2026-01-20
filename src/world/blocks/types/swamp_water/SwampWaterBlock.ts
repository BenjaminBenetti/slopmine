import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IBlock } from '../../../interfaces/IBlock.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import swampWaterTexUrl from './assets/swamp-water.webp'

// Register texture for atlas (marked as transparent)
registerTextureUrl(TextureId.SWAMP_WATER, swampWaterTexUrl, true)

const swampWaterTexture = loadBlockTexture(swampWaterTexUrl)

/**
 * Semi-transparent murky material for swamp water with texture.
 * depthWrite: true prevents overlapping water fragments from causing artifacts.
 */
const swampWaterMaterial = new THREE.MeshLambertMaterial({
  map: swampWaterTexture,
  transparent: true,
  opacity: 0.95,
  side: THREE.DoubleSide,
  depthWrite: true,
})

/**
 * Swamp water block - a murky transparent liquid.
 * Used in swamp biome for murky water pools.
 */
export class SwampWaterBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SWAMP_WATER,
    name: 'swamp_water',
    isOpaque: false,
    isSolid: false,
    isLiquid: true,
    hardness: 100,
    lightLevel: 0,
    lightBlocking: 3,
    demolitionForceRequired: Infinity,
    tags: [],
    liquidFamily: 'swamp_water',
    liquidLevel: 8,
  }

  protected get defaultTextureId(): number {
    return TextureId.SWAMP_WATER
  }

  protected getMaterials(): THREE.Material {
    return swampWaterMaterial
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
    if (neighbor.properties.liquidFamily === 'swamp_water') {
      return false
    }
    return true
  }
}
