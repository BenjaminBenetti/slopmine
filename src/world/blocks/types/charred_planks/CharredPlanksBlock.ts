import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { CharredPlanksBlockItem } from '../../../../items/blocks/charred_planks/CharredPlanksBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import charredPlanksTexUrl from './assets/charred-planks.webp'

registerTextureUrl(TextureId.CHARRED_PLANKS, charredPlanksTexUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(charredPlanksTexUrl) })

/**
 * Charred planks: scorched timber flooring of the Infernal Bastion's barracks
 * and upper floors. Normal wood (any axe or by hand).
 */
export class CharredPlanksBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CHARRED_PLANKS,
    name: 'charred_planks',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.CHARRED_PLANKS
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new CharredPlanksBlockItem()]
  }
}
