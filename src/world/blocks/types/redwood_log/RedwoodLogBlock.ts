import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { RedwoodLogBlockItem } from '../../../../items/blocks/redwood_log/RedwoodLogBlockItem.ts'
import redwoodLogTexUrl from './assets/redwood-log.webp'
import redwoodLogTopTexUrl from './assets/redwood-log-top.webp'

// Register textures for atlas
registerTextureUrl(TextureId.REDWOOD_LOG_SIDE, redwoodLogTexUrl)
registerTextureUrl(TextureId.REDWOOD_LOG_END, redwoodLogTopTexUrl)

const redwoodLogTexture = loadBlockTexture(redwoodLogTexUrl)
const redwoodLogTopTexture = loadBlockTexture(redwoodLogTopTexUrl)

const redwoodLogMaterial = new THREE.MeshLambertMaterial({ map: redwoodLogTexture })
const redwoodLogTopMaterial = new THREE.MeshLambertMaterial({ map: redwoodLogTopTexture })

export class RedwoodLogBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.REDWOOD_LOG,
    name: 'redwood_log',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.8,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.REDWOOD_LOG_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      redwoodLogMaterial,    // +X (right) - bark
      redwoodLogMaterial,    // -X (left) - bark
      redwoodLogTopMaterial, // +Y (top) - log end
      redwoodLogTopMaterial, // -Y (bottom) - log end
      redwoodLogMaterial,    // +Z (front) - bark
      redwoodLogMaterial,    // -Z (back) - bark
    ]
  }

  /**
   * Return texture ID for each face for greedy meshing.
   * TOP=0, BOTTOM=1, NORTH=2, SOUTH=3, EAST=4, WEST=5
   */
  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case 0: // TOP
      case 1: // BOTTOM
        return TextureId.REDWOOD_LOG_END
      default:
        return TextureId.REDWOOD_LOG_SIDE
    }
  }

  getDrops(): IItem[] {
    return [new RedwoodLogBlockItem()]
  }
}
