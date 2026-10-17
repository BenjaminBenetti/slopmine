import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { AshSnowBlockItem } from '../../../../items/blocks/ash_snow/AshSnowBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/ash-snow.webp'

registerTextureUrl(TextureId.ASH_SNOW, texUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Ash snow - grey drifts of snow and fallen ash heaped on the shores and the
 * frozen lake of Cocytus.
 */
export class AshSnowBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.ASH_SNOW,
    name: 'ash_snow',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.4,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.SOIL],
  }

  protected get defaultTextureId(): number {
    return TextureId.ASH_SNOW
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new AshSnowBlockItem()]
  }
}
