import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { BurialNicheBlockItem } from '../../../../items/blocks/burial_niche/BurialNicheBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/burial-niche.webp'

registerTextureUrl(TextureId.BURIAL_NICHE, texUrl)

const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Burial niche - a loculus cut into the crypt wall, a skull resting on its
 * bones. Lines the Catacombs corridors. Dungeon structural block (force 6).
 */
export class BurialNicheBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.BURIAL_NICHE,
    name: 'burial_niche',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 60.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.BURIAL_NICHE
  }

  protected getMaterials(): THREE.Material {
    return sideMaterial
  }

  getDrops(): IItem[] {
    return [new BurialNicheBlockItem()]
  }
}
