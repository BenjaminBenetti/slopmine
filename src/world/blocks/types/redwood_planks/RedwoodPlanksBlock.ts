import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { RedwoodPlanksBlockItem } from '../../../../items/blocks/redwood_planks/RedwoodPlanksBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import redwoodPlanksTexUrl from './assets/redwood-planks.webp'

// Register texture for atlas
registerTextureUrl(TextureId.REDWOOD_PLANKS, redwoodPlanksTexUrl)

const redwoodPlanksTexture = loadBlockTexture(redwoodPlanksTexUrl)
const redwoodPlanksMaterial = new THREE.MeshLambertMaterial({ map: redwoodPlanksTexture })

/**
 * Redwood planks block - crafted wooden building block.
 */
export class RedwoodPlanksBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.REDWOOD_PLANKS,
    name: 'redwood_planks',
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
    return TextureId.REDWOOD_PLANKS
  }

  protected getMaterials(): THREE.Material {
    return redwoodPlanksMaterial
  }

  getDrops(): IItem[] {
    return [new RedwoodPlanksBlockItem()]
  }
}
