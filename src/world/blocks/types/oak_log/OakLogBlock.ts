import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { LogBlock, LOG_SUPPORT_TICK_INTERVAL } from '../log_shared/LogBlock.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { OakLogBlockItem } from '../../../../items/blocks/oak_log/OakLogBlockItem.ts'
import oakLogTexUrl from './assets/oak-log.webp'
import oakLogTopTexUrl from './assets/oak-log-top.webp'

// Register textures for atlas
registerTextureUrl(TextureId.OAK_LOG_SIDE, oakLogTexUrl)
registerTextureUrl(TextureId.OAK_LOG_END, oakLogTopTexUrl)

const oakLogTexture = loadBlockTexture(oakLogTexUrl)
const oakLogTopTexture = loadBlockTexture(oakLogTopTexUrl)

const oakLogMaterial = new THREE.MeshLambertMaterial({ map: oakLogTexture })
const oakLogTopMaterial = new THREE.MeshLambertMaterial({ map: oakLogTopTexture })

export class OakLogBlock extends LogBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_LOG,
    name: 'oak_log',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
    tickInterval: LOG_SUPPORT_TICK_INTERVAL,
  }

  protected get defaultTextureId(): number {
    return TextureId.OAK_LOG_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      oakLogMaterial,    // +X (right) - bark
      oakLogMaterial,    // -X (left) - bark
      oakLogTopMaterial, // +Y (top) - log end
      oakLogTopMaterial, // -Y (bottom) - log end
      oakLogMaterial,    // +Z (front) - bark
      oakLogMaterial,    // -Z (back) - bark
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
        return TextureId.OAK_LOG_END
      default:
        return TextureId.OAK_LOG_SIDE
    }
  }

  getDrops(): IItem[] {
    return [new OakLogBlockItem()]
  }
}
