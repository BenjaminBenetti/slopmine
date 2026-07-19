import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { PinePlanksBlockItem } from '../../../../items/blocks/pine_planks/PinePlanksBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import pinePlanksTexUrl from './assets/pine-planks.webp'

// Register texture for atlas
registerTextureUrl(TextureId.PINE_PLANKS, pinePlanksTexUrl)

const pinePlanksTexture = loadBlockTexture(pinePlanksTexUrl)
const pinePlanksMaterial = new THREE.MeshLambertMaterial({ map: pinePlanksTexture })

/**
 * Pine planks block - crafted wooden building block.
 */
export class PinePlanksBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_PLANKS,
    name: 'pine_planks',
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
    return TextureId.PINE_PLANKS
  }

  protected getMaterials(): THREE.Material {
    return pinePlanksMaterial
  }

  getDrops(): IItem[] {
    return [new PinePlanksBlockItem()]
  }
}
