import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { PineLogBlockItem } from '../../../../items/blocks/pine_log/PineLogBlockItem.ts'
import { PineResinItem } from '../../../../items/materials/pine_resin/PineResinItem.ts'
import pineLogTexUrl from './assets/pine-log.webp'
import pineLogTopTexUrl from './assets/pine-log-top.webp'

// Register textures for atlas
registerTextureUrl(TextureId.PINE_LOG_SIDE, pineLogTexUrl)
registerTextureUrl(TextureId.PINE_LOG_END, pineLogTopTexUrl)

const pineLogTexture = loadBlockTexture(pineLogTexUrl)
const pineLogTopTexture = loadBlockTexture(pineLogTopTexUrl)

const pineLogMaterial = new THREE.MeshLambertMaterial({ map: pineLogTexture })
const pineLogTopMaterial = new THREE.MeshLambertMaterial({ map: pineLogTopTexture })

export class PineLogBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_LOG,
    name: 'pine_log',
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
      pineLogMaterial,    // +X (right) - bark
      pineLogMaterial,    // -X (left) - bark
      pineLogTopMaterial, // +Y (top) - log end
      pineLogTopMaterial, // -Y (bottom) - log end
      pineLogMaterial,    // +Z (front) - bark
      pineLogMaterial,    // -Z (back) - bark
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
        return TextureId.PINE_LOG_END
      default:
        return TextureId.PINE_LOG_SIDE
    }
  }

  getDrops(): IItem[] {
    const drops: IItem[] = [new PineLogBlockItem()]
    // Sticky resin occasionally oozes from felled pine logs
    if (Math.random() < 0.25) {
      drops.push(new PineResinItem())
    }
    return drops
  }
}
