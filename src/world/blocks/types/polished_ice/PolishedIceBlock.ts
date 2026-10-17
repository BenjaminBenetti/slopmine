import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { PolishedIceBlockItem } from '../../../../items/blocks/polished_ice/PolishedIceBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/polished-ice.webp'

registerTextureUrl(TextureId.POLISHED_ICE, texUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Polished ice - glacial ice ground smooth. Crafted building block; also
 * paves the halls of the Frozen Citadel.
 */
export class PolishedIceBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.POLISHED_ICE,
    name: 'polished_ice',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.POLISHED_ICE
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new PolishedIceBlockItem()]
  }
}
