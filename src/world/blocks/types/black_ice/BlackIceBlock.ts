import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { BlackIceBlockItem } from '../../../../items/blocks/black_ice/BlackIceBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/black-ice.webp'

registerTextureUrl(TextureId.BLACK_ICE, texUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Black ice - the frozen lake of Cocytus. Dark glassy ice, solid and opaque,
 * filling the lake bed where the other Hell biomes hold lava.
 */
export class BlackIceBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.BLACK_ICE,
    name: 'black_ice',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 3.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 2,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.BLACK_ICE
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new BlackIceBlockItem()]
  }
}
