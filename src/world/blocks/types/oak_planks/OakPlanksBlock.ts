import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { OakPlanksBlockItem } from '../../../../items/blocks/oak_planks/OakPlanksBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import oakPlanksTexUrl from './assets/oak-planks.webp'

// Register texture for atlas
registerTextureUrl(TextureId.OAK_PLANKS, oakPlanksTexUrl)

const oakPlanksTexture = loadBlockTexture(oakPlanksTexUrl)
const oakPlanksMaterial = new THREE.MeshLambertMaterial({ map: oakPlanksTexture })

/**
 * Oak planks block - crafted wooden building block.
 */
export class OakPlanksBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_PLANKS,
    name: 'oak_planks',
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
    return TextureId.OAK_PLANKS
  }

  protected getMaterials(): THREE.Material {
    return oakPlanksMaterial
  }

  getDrops(): IItem[] {
    return [new OakPlanksBlockItem()]
  }
}
