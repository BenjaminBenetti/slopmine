import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IBlock } from '../../../interfaces/IBlock.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import lavaTexUrl from './assets/lava.webp'

// Register texture for atlas (marked as transparent)
registerTextureUrl(TextureId.LAVA, lavaTexUrl, true)

const lavaTexture = loadBlockTexture(lavaTexUrl)

/**
 * Semi-transparent orange material for lava with texture.
 * depthWrite: true prevents overlapping lava fragments from causing artifacts.
 */
const lavaMaterial = new THREE.MeshLambertMaterial({
  map: lavaTexture,
  transparent: true,
  opacity: 0.95,
  side: THREE.DoubleSide,
  depthWrite: true,
  emissive: new THREE.Color(0xff4400),
  emissiveIntensity: 0.3,
})

/**
 * Lava block - a transparent, non-solid liquid that emits light.
 * Lava fills deep terrain areas during world generation.
 */
export class LavaBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.LAVA,
    name: 'lava',
    isOpaque: false,
    isSolid: false,
    isLiquid: true,
    hardness: 100,
    lightLevel: 15,
    lightBlocking: 0,
    demolitionForceRequired: Infinity,
    tags: [],
    liquidFamily: 'lava',
    liquidLevel: 8,
  }

  protected get defaultTextureId(): number {
    return TextureId.LAVA
  }

  protected getMaterials(): THREE.Material {
    return lavaMaterial
  }

  /**
   * Lava should be greedy-meshed to eliminate internal face z-fighting.
   * It will be placed in a separate transparent mesh group.
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
   * Don't render faces between adjacent lava blocks.
   */
  override shouldRenderFace(_face: BlockFace, neighbor: IBlock): boolean {
    // Always render face if neighbor is air
    if (neighbor.properties.id === BlockIds.AIR) {
      return true
    }
    // Don't render faces between lava blocks
    if (neighbor.properties.isLiquid) {
      return false
    }
    // Render face against any other block
    return true
  }
}
