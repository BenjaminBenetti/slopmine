import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { PineLogBlockItem } from '../../../../items/blocks/pine_log/PineLogBlockItem.ts'

// Reuse the pine log textures (registered in the atlas by the pine log block module)
import pineLogTexUrl from '../pine_log/assets/pine-log.webp'
import pineLogTopTexUrl from '../pine_log/assets/pine-log-top.webp'

const pineLogTexture = loadBlockTexture(pineLogTexUrl)
const pineLogTopTexture = loadBlockTexture(pineLogTopTexUrl)

const barkMaterial = new THREE.MeshLambertMaterial({ map: pineLogTexture })
const ringMaterial = new THREE.MeshLambertMaterial({ map: pineLogTopTexture })

/**
 * Fallen pine log lying along the Z axis - a worldgen forest-floor decoration.
 * Log-end rings show on the +-Z faces, bark everywhere else.
 *
 * Deliberately does NOT extend LogBlock: fallen logs are debris, not standing
 * trunks, and must not participate in the tree-felling support rule.
 */
export class FallenPineLogZBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.FALLEN_PINE_LOG_Z,
    name: 'fallen_pine_log_z',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.PINE_LOG_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      barkMaterial, // +X (east) - bark
      barkMaterial, // -X (west) - bark
      barkMaterial, // +Y (top) - bark
      barkMaterial, // -Y (bottom) - bark
      ringMaterial, // +Z (south) - log end
      ringMaterial, // -Z (north) - log end
    ]
  }

  /**
   * Return texture ID for each face for greedy meshing.
   * TOP=0, BOTTOM=1, NORTH(-Z)=2, SOUTH(+Z)=3, EAST(+X)=4, WEST(-X)=5
   */
  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case 2: // NORTH (-Z)
      case 3: // SOUTH (+Z)
        return TextureId.PINE_LOG_END
      default:
        return TextureId.PINE_LOG_SIDE
    }
  }

  getDrops(): IItem[] {
    return [new PineLogBlockItem()]
  }
}
